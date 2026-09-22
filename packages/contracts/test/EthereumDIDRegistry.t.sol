// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EthereumDIDRegistry} from "../src/EthereumDIDRegistry.sol";

contract EthereumDIDRegistryTest is Test {
    EthereumDIDRegistry internal registry;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    event DIDOwnerChanged(address indexed identity, address owner, uint256 previousChange);

    function setUp() public {
        registry = new EthereumDIDRegistry();
    }

    function test_identityOwnerDefaultsToSelf() public view {
        assertEq(registry.identityOwner(alice), alice);
        assertEq(registry.changed(alice), 0);
    }

    function test_changeOwnerEmitsEvent() public {
        vm.expectEmit(true, false, false, true, address(registry));
        emit DIDOwnerChanged(alice, bob, 0);
        vm.prank(alice);
        registry.changeOwner(alice, bob);
        assertEq(registry.identityOwner(alice), bob);
        assertEq(registry.changed(alice), block.number);
    }

    function test_changeOwnerRevertsForNonOwner() public {
        vm.prank(bob);
        vm.expectRevert(bytes("bad_actor"));
        registry.changeOwner(alice, bob);
    }

    function test_addDelegateValidity() public {
        bytes32 delegateType = "sigAuth";
        vm.prank(alice);
        registry.addDelegate(alice, delegateType, bob, 1 days);
        assertTrue(registry.validDelegate(alice, delegateType, bob));
        vm.warp(block.timestamp + 1 days + 1);
        assertFalse(registry.validDelegate(alice, delegateType, bob));
    }
}
