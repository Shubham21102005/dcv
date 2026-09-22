// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IssuerTrustRegistry} from "../src/IssuerTrustRegistry.sol";

contract IssuerTrustRegistryTest is Test {
    IssuerTrustRegistry internal registry;
    address internal admin = makeAddr("admin");
    address internal university = makeAddr("university");
    address internal stranger = makeAddr("stranger");
    string internal constant DEGREE = "UniversityDegreeCredential";

    event IssuerRegistered(address indexed issuer, string name, string metadataURI);
    event IssuerRevoked(address indexed issuer);
    event IssuerReactivated(address indexed issuer);
    event CredentialTypeAllowed(address indexed issuer, bytes32 indexed typeHash, string credentialType);
    event CredentialTypeDisallowed(address indexed issuer, bytes32 indexed typeHash);

    function setUp() public {
        registry = new IssuerTrustRegistry(admin);
    }

    function _register() internal {
        vm.prank(admin);
        registry.registerIssuer(university, "Anvil State University", "http://localhost:4001/metadata.json");
    }

    function test_registerIssuer_setsActiveAndEmits() public {
        vm.expectEmit(true, false, false, true, address(registry));
        emit IssuerRegistered(university, "Anvil State University", "http://localhost:4001/metadata.json");
        _register();
        IssuerTrustRegistry.IssuerInfo memory info = registry.getIssuer(university);
        assertTrue(info.active);
        assertEq(info.name, "Anvil State University");
        assertEq(info.metadataURI, "http://localhost:4001/metadata.json");
        assertEq(info.registeredAt, uint64(block.timestamp));
        assertTrue(registry.isTrusted(university));
    }

    function test_registerIssuer_revertsIfAlreadyRegistered() public {
        _register();
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IssuerTrustRegistry.AlreadyRegistered.selector, university));
        registry.registerIssuer(university, "again", "");
    }

    function test_registerIssuer_revertsZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(IssuerTrustRegistry.ZeroAddress.selector);
        registry.registerIssuer(address(0), "zero", "");
    }

    function test_allowCredentialType_thenIsTrustedFor() public {
        _register();
        assertFalse(registry.isTrustedFor(university, DEGREE));
        vm.expectEmit(true, true, false, true, address(registry));
        emit CredentialTypeAllowed(university, keccak256(bytes(DEGREE)), DEGREE);
        vm.prank(admin);
        registry.allowCredentialType(university, DEGREE);
        assertTrue(registry.isTrustedFor(university, DEGREE));
    }

    function test_isTrustedFor_falseForUnknownType() public {
        _register();
        vm.prank(admin);
        registry.allowCredentialType(university, DEGREE);
        assertFalse(registry.isTrustedFor(university, "PassportCredential"));
    }

    function test_disallowCredentialType_makesIsTrustedForFalse() public {
        _register();
        vm.startPrank(admin);
        registry.allowCredentialType(university, DEGREE);
        vm.expectEmit(true, true, false, false, address(registry));
        emit CredentialTypeDisallowed(university, keccak256(bytes(DEGREE)));
        registry.disallowCredentialType(university, DEGREE);
        vm.stopPrank();
        assertFalse(registry.isTrustedFor(university, DEGREE));
        assertTrue(registry.isTrusted(university)); // still active, just not for this type
    }

    function test_revokeIssuer_makesIsTrustedForFalse() public {
        _register();
        vm.startPrank(admin);
        registry.allowCredentialType(university, DEGREE);
        vm.expectEmit(true, false, false, false, address(registry));
        emit IssuerRevoked(university);
        registry.revokeIssuer(university);
        vm.stopPrank();
        assertFalse(registry.isTrusted(university));
        assertFalse(registry.isTrustedFor(university, DEGREE));
    }

    function test_reactivateIssuer_restoresTrust_andRevertsIfActive() public {
        _register();
        vm.startPrank(admin);
        registry.allowCredentialType(university, DEGREE);
        vm.expectRevert(abi.encodeWithSelector(IssuerTrustRegistry.AlreadyActive.selector, university));
        registry.reactivateIssuer(university);
        registry.revokeIssuer(university);
        vm.expectEmit(true, false, false, false, address(registry));
        emit IssuerReactivated(university);
        registry.reactivateIssuer(university);
        vm.stopPrank();
        assertTrue(registry.isTrustedFor(university, DEGREE)); // allowed types survived the revoke
    }

    function test_mutators_revertForUnregisteredIssuer() public {
        vm.startPrank(admin);
        bytes memory err = abi.encodeWithSelector(IssuerTrustRegistry.NotRegistered.selector, stranger);
        vm.expectRevert(err);
        registry.revokeIssuer(stranger);
        vm.expectRevert(err);
        registry.reactivateIssuer(stranger);
        vm.expectRevert(err);
        registry.allowCredentialType(stranger, DEGREE);
        vm.expectRevert(err);
        registry.disallowCredentialType(stranger, DEGREE);
        vm.stopPrank();
    }

    function test_onlyOwner_revertsForStranger() public {
        _register();
        vm.startPrank(stranger);
        bytes memory err = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger);
        vm.expectRevert(err);
        registry.registerIssuer(stranger, "x", "");
        vm.expectRevert(err);
        registry.revokeIssuer(university);
        vm.expectRevert(err);
        registry.reactivateIssuer(university);
        vm.expectRevert(err);
        registry.allowCredentialType(university, DEGREE);
        vm.expectRevert(err);
        registry.disallowCredentialType(university, DEGREE);
        vm.stopPrank();
    }

    function testFuzz_unknownAddressNeverTrusted(address a) public {
        vm.assume(a != university);
        _register();
        vm.prank(admin);
        registry.allowCredentialType(university, DEGREE);
        assertFalse(registry.isTrusted(a));
        assertFalse(registry.isTrustedFor(a, DEGREE));
    }
}
