// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VaultPointer} from "../src/VaultPointer.sol";

contract VaultPointerTest is Test {
    VaultPointer internal pointer;
    address internal holder = makeAddr("holder");
    address internal other = makeAddr("other");

    event PointerSet(address indexed owner, uint64 updatedAt);
    event PointerCleared(address indexed owner);

    function setUp() public {
        pointer = new VaultPointer();
    }

    function test_setPointer_thenGetPointer() public {
        bytes memory locator = hex"0102030405060708090a0b0c";
        vm.expectEmit(true, false, false, true, address(pointer));
        emit PointerSet(holder, uint64(block.timestamp));
        vm.prank(holder);
        pointer.setPointer(locator);
        (bytes memory stored, uint64 updatedAt) = pointer.getPointer(holder);
        assertEq(stored, locator);
        assertEq(updatedAt, uint64(block.timestamp));
    }

    function test_getPointer_emptyForOtherAddress() public {
        vm.prank(holder);
        pointer.setPointer(hex"ff");
        (bytes memory stored, uint64 updatedAt) = pointer.getPointer(other);
        assertEq(stored.length, 0);
        assertEq(updatedAt, 0);
    }

    function test_setPointer_revertsTooLarge() public {
        bytes memory tooBig = new bytes(513);
        vm.prank(holder);
        vm.expectRevert(abi.encodeWithSelector(VaultPointer.TooLarge.selector, 513));
        pointer.setPointer(tooBig);
        // exactly MAX_LENGTH is fine
        vm.prank(holder);
        pointer.setPointer(new bytes(512));
    }

    function test_clearPointer_emitsAndEmpties() public {
        vm.startPrank(holder);
        pointer.setPointer(hex"aabb");
        vm.expectEmit(true, false, false, false, address(pointer));
        emit PointerCleared(holder);
        pointer.clearPointer();
        vm.stopPrank();
        (bytes memory stored, uint64 updatedAt) = pointer.getPointer(holder);
        assertEq(stored.length, 0);
        assertEq(updatedAt, 0);
    }

    function testFuzz_setPointer_roundTrips(bytes calldata locator) public {
        vm.assume(locator.length <= 512);
        vm.prank(holder);
        pointer.setPointer(locator);
        (bytes memory stored,) = pointer.getPointer(holder);
        assertEq(stored, locator);
    }
}
