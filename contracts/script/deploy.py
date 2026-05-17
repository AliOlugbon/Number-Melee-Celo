import json
from moccasin.config import get_active_network
from moccasin.boa_tools import VyperContract
from src import NumberMelee

def moccasin_main() -> VyperContract:
    active_network = get_active_network()
    print(f"\n  Deploying NumberMelee on {active_network.name}")

    melee = NumberMelee.deploy()

    print(f"  Contract : {melee.address}")
    print()
    abi = melee.abi

    # Save ABI
    with open("NumberMelee.abi.json", "w") as f:
        json.dump(abi, f, indent=2)
    print("\nABI saved to NumberMelee.abi.json")

    return melee

