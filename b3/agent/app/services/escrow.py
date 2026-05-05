"""USDC deposit monitoring + payout from the TEE wallet.

For v1 we use direct ERC-20 transfers (no on-chain escrow contract). The agent
polls Transfer logs to its own address and, once a deposit covers the bounty
amount for the matching attestation, releases the report and pays the researcher
(amount minus FEE_BPS_PUBLIC).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Optional

from eth_account.signers.local import LocalAccount
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

from ..config import get_settings
from . import signer

log = logging.getLogger(__name__)

# Canonical USDC contracts per chain. (For Sepolia we use the Circle testnet USDC.)
USDC_BY_CHAIN: dict[int, str] = {
    1:     "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    8453:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  # Base Sepolia USDC
    137:   "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
}

ERC20_ABI = [
    {
        "constant": True,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function",
    },
    {
        "constant": False,
        "inputs": [
            {"name": "_to", "type": "address"},
            {"name": "_value", "type": "uint256"},
        ],
        "name": "transfer",
        "outputs": [{"name": "", "type": "bool"}],
        "type": "function",
    },
    {
        "constant": True, "inputs": [], "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}], "type": "function",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "from", "type": "address"},
            {"indexed": True, "name": "to", "type": "address"},
            {"indexed": False, "name": "value", "type": "uint256"},
        ],
        "name": "Transfer",
        "type": "event",
    },
]


@dataclass
class DepositCheck:
    found: bool
    tx_hash: Optional[str]
    amount_usd: float
    block_number: int


def _web3(chain_id: int) -> Web3:
    s = get_settings()
    rpc = s.rpc_for_chain(chain_id)
    if not rpc:
        raise ValueError(f"no RPC for chain_id={chain_id}")
    w3 = Web3(Web3.HTTPProvider(rpc))
    if chain_id in (137, 84532):
        w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
    return w3


def _usdc(w3: Web3, chain_id: int):
    s = get_settings()
    if s.MOCK_USDC_ADDRESS and chain_id == s.MOCK_USDC_CHAIN_ID:
        addr = s.MOCK_USDC_ADDRESS
    else:
        addr = USDC_BY_CHAIN.get(chain_id)
    if not addr:
        raise ValueError(f"no USDC contract known for chain_id={chain_id}")
    return w3.eth.contract(address=Web3.to_checksum_address(addr), abi=ERC20_ABI)


async def check_deposit(
    chain_id: int, expected_amount_usd: float, since_block: int = 0,
) -> DepositCheck:
    """Look for an inbound USDC Transfer to the agent address >= expected amount."""
    w3 = _web3(chain_id)
    usdc = _usdc(w3, chain_id)
    decimals = usdc.functions.decimals().call()
    expected_units = int(expected_amount_usd * (10 ** decimals))

    agent = Web3.to_checksum_address(signer.agent_address())
    head = w3.eth.block_number
    from_block = max(since_block, head - 5_000)  # cap the lookback window

    transfer_topic = w3.keccak(text="Transfer(address,address,uint256)").to_0x_hex()
    logs = w3.eth.get_logs({
        "fromBlock": from_block,
        "toBlock": head,
        "address": usdc.address,
        "topics": [transfer_topic, None, "0x" + agent[2:].rjust(64, "0").lower()],
    })

    for entry in logs:
        value = int(entry["data"], 16) if isinstance(entry["data"], str) else int.from_bytes(entry["data"], "big")
        if value >= expected_units:
            return DepositCheck(
                found=True,
                tx_hash=entry["transactionHash"].to_0x_hex(),
                amount_usd=value / (10 ** decimals),
                block_number=entry["blockNumber"],
            )

    return DepositCheck(found=False, tx_hash=None, amount_usd=0.0, block_number=head)


def _account_for_signing() -> LocalAccount:
    # signer._account() is cached; reuse it.
    return signer._account()


async def transfer_usdc(
    chain_id: int, to: str, amount_usd: float,
) -> str:
    """Send USDC from the agent wallet. Returns tx hash."""
    w3 = _web3(chain_id)
    usdc = _usdc(w3, chain_id)
    decimals = usdc.functions.decimals().call()
    units = int(amount_usd * (10 ** decimals))

    acct = _account_for_signing()
    nonce = w3.eth.get_transaction_count(acct.address)
    tx = usdc.functions.transfer(Web3.to_checksum_address(to), units).build_transaction({
        "from": acct.address,
        "nonce": nonce,
        "chainId": chain_id,
        # gas / gasPrice estimated by web3 default. EIP-1559 chains will use eth_feeHistory.
    })
    signed = acct.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(signed.raw_transaction)
    return h.to_0x_hex()


async def wait_for_deposit(
    chain_id: int,
    expected_amount_usd: float,
    poll_seconds: int = 6,
    timeout_seconds: int = 60 * 60,
) -> DepositCheck:
    """Background task: poll until a matching deposit lands, or time out."""
    elapsed = 0
    last_block = 0
    while elapsed < timeout_seconds:
        check = await check_deposit(chain_id, expected_amount_usd, since_block=last_block)
        if check.found:
            return check
        last_block = check.block_number
        await asyncio.sleep(poll_seconds)
        elapsed += poll_seconds
    return DepositCheck(found=False, tx_hash=None, amount_usd=0.0, block_number=last_block)
