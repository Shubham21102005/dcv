// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title IssuerTrustRegistry
/// @notice Governance-controlled list of credential issuers and the credential
///         types each one is trusted to issue. Only organisational data lives here.
contract IssuerTrustRegistry is Ownable {
    struct IssuerInfo {
        string name;
        string metadataURI;
        bool active;
        uint64 registeredAt;
    }

    mapping(address => IssuerInfo) private _issuers;
    /// issuer => keccak256(credentialType) => allowed
    mapping(address => mapping(bytes32 => bool)) private _allowedTypes;

    event IssuerRegistered(address indexed issuer, string name, string metadataURI);
    event IssuerRevoked(address indexed issuer);
    event IssuerReactivated(address indexed issuer);
    event CredentialTypeAllowed(address indexed issuer, bytes32 indexed typeHash, string credentialType);
    event CredentialTypeDisallowed(address indexed issuer, bytes32 indexed typeHash);

    error NotRegistered(address issuer);
    error AlreadyRegistered(address issuer);
    error AlreadyActive(address issuer);
    error ZeroAddress();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function registerIssuer(address issuer, string calldata name, string calldata metadataURI) external onlyOwner {
        if (issuer == address(0)) revert ZeroAddress();
        if (_issuers[issuer].registeredAt != 0) revert AlreadyRegistered(issuer);
        _issuers[issuer] = IssuerInfo({
            name: name,
            metadataURI: metadataURI,
            active: true,
            registeredAt: uint64(block.timestamp)
        });
        emit IssuerRegistered(issuer, name, metadataURI);
    }

    /// @notice Deactivates an issuer. Allowed types are kept so reactivation restores them.
    function revokeIssuer(address issuer) external onlyOwner {
        _requireRegistered(issuer);
        _issuers[issuer].active = false;
        emit IssuerRevoked(issuer);
    }

    function reactivateIssuer(address issuer) external onlyOwner {
        _requireRegistered(issuer);
        if (_issuers[issuer].active) revert AlreadyActive(issuer);
        _issuers[issuer].active = true;
        emit IssuerReactivated(issuer);
    }

    function allowCredentialType(address issuer, string calldata credentialType) external onlyOwner {
        _requireRegistered(issuer);
        bytes32 typeHash = keccak256(bytes(credentialType));
        _allowedTypes[issuer][typeHash] = true;
        emit CredentialTypeAllowed(issuer, typeHash, credentialType);
    }

    function disallowCredentialType(address issuer, string calldata credentialType) external onlyOwner {
        _requireRegistered(issuer);
        bytes32 typeHash = keccak256(bytes(credentialType));
        _allowedTypes[issuer][typeHash] = false;
        emit CredentialTypeDisallowed(issuer, typeHash);
    }

    function isTrusted(address issuer) external view returns (bool) {
        return _issuers[issuer].active;
    }

    function isTrustedFor(address issuer, string calldata credentialType) external view returns (bool) {
        return _issuers[issuer].active && _allowedTypes[issuer][keccak256(bytes(credentialType))];
    }

    function getIssuer(address issuer) external view returns (IssuerInfo memory) {
        return _issuers[issuer];
    }

    function _requireRegistered(address issuer) private view {
        if (_issuers[issuer].registeredAt == 0) revert NotRegistered(issuer);
    }
}
