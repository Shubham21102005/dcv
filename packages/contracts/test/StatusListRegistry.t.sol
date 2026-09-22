// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StatusListRegistry} from "../src/StatusListRegistry.sol";

contract StatusListRegistryTest is Test {
    StatusListRegistry internal registry;
    address internal issuerA = makeAddr("issuerA");
    address internal issuerB = makeAddr("issuerB");
    string internal constant CID1 = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    string internal constant CID2 = "bafkreibbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    bytes32 internal constant HASH1 = keccak256("status-list-v1");
    bytes32 internal constant HASH2 = keccak256("status-list-v2");

    event StatusListPublished(
        address indexed issuer, uint256 indexed listId, uint64 version, string cid, bytes32 contentHash, string purpose
    );

    function setUp() public {
        registry = new StatusListRegistry();
    }

    function test_publish_storesAndEmits() public {
        vm.expectEmit(true, true, false, true, address(registry));
        emit StatusListPublished(issuerA, 1, 1, CID1, HASH1, "revocation");
        vm.prank(issuerA);
        registry.publish(1, CID1, HASH1, "revocation");

        StatusListRegistry.StatusList memory list = registry.get(issuerA, 1);
        assertEq(list.cid, CID1);
        assertEq(list.contentHash, HASH1);
        assertEq(list.purpose, "revocation");
        assertEq(list.version, 1);
        assertEq(list.updatedAt, uint64(block.timestamp));
    }

    function test_publish_incrementsVersion() public {
        vm.startPrank(issuerA);
        registry.publish(1, CID1, HASH1, "revocation");
        vm.warp(block.timestamp + 100);
        registry.publish(1, CID2, HASH2, "revocation");
        vm.stopPrank();
        StatusListRegistry.StatusList memory list = registry.get(issuerA, 1);
        assertEq(list.version, 2);
        assertEq(list.cid, CID2);
        assertEq(list.contentHash, HASH2);
        assertEq(registry.versionOf(issuerA, 1), 2);
    }

    function test_publish_revertsEmptyCid() public {
        vm.prank(issuerA);
        vm.expectRevert(StatusListRegistry.EmptyCid.selector);
        registry.publish(1, "", HASH1, "revocation");
    }

    function test_publish_revertsEmptyHash() public {
        vm.prank(issuerA);
        vm.expectRevert(StatusListRegistry.EmptyHash.selector);
        registry.publish(1, CID1, bytes32(0), "revocation");
    }

    function test_get_isolatedPerIssuer() public {
        vm.prank(issuerA);
        registry.publish(1, CID1, HASH1, "revocation");
        vm.prank(issuerB);
        registry.publish(1, CID2, HASH2, "suspension");
        assertEq(registry.get(issuerA, 1).cid, CID1);
        assertEq(registry.get(issuerB, 1).cid, CID2);
        assertEq(registry.get(issuerB, 1).purpose, "suspension");
        assertEq(registry.versionOf(issuerA, 1), 1);
        assertEq(registry.versionOf(issuerB, 1), 1);
    }

    function test_versionOf_zeroBeforeFirstPublish() public view {
        assertEq(registry.versionOf(issuerA, 1), 0);
        assertEq(registry.get(issuerA, 7).contentHash, bytes32(0));
    }

    function testFuzz_publish_anyListId(uint256 listId) public {
        vm.prank(issuerA);
        registry.publish(listId, CID1, HASH1, "revocation");
        assertEq(registry.versionOf(issuerA, listId), 1);
        assertEq(registry.get(issuerA, listId).contentHash, HASH1);
    }
}
