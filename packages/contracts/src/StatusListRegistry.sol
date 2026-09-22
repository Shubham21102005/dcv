// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title StatusListRegistry
/// @notice Anchors an issuer's Bitstring Status List credentials: the IPFS CID of
///         the signed list plus a keccak256 of its exact bytes. Scoped to
///         msg.sender, so an issuer can only ever publish under its own address;
///         whether that issuer is trusted is decided by IssuerTrustRegistry.
contract StatusListRegistry {
    struct StatusList {
        string cid;
        bytes32 contentHash;
        string purpose;
        uint64 version;
        uint64 updatedAt;
    }

    /// issuer => listId => list
    mapping(address => mapping(uint256 => StatusList)) private _lists;

    event StatusListPublished(
        address indexed issuer, uint256 indexed listId, uint64 version, string cid, bytes32 contentHash, string purpose
    );

    error EmptyCid();
    error EmptyHash();

    function publish(uint256 listId, string calldata cid, bytes32 contentHash, string calldata purpose) external {
        if (bytes(cid).length == 0) revert EmptyCid();
        if (contentHash == bytes32(0)) revert EmptyHash();
        StatusList storage list = _lists[msg.sender][listId];
        list.cid = cid;
        list.contentHash = contentHash;
        list.purpose = purpose;
        list.version += 1;
        list.updatedAt = uint64(block.timestamp);
        emit StatusListPublished(msg.sender, listId, list.version, cid, contentHash, purpose);
    }

    function get(address issuer, uint256 listId) external view returns (StatusList memory) {
        return _lists[issuer][listId];
    }

    function versionOf(address issuer, uint256 listId) external view returns (uint64) {
        return _lists[issuer][listId].version;
    }
}
