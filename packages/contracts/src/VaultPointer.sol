// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VaultPointer
/// @notice One opaque, encrypted locator per address. The wallet writes it from a
///         seed-derived pseudonymous address; the value is AES-GCM ciphertext of an
///         IPFS CID, so nothing on-chain links a holder to a DID or a backup.
contract VaultPointer {
    uint256 public constant MAX_LENGTH = 512;

    mapping(address => bytes) private _pointers;
    mapping(address => uint64) public updatedAt;

    event PointerSet(address indexed owner, uint64 updatedAt);
    event PointerCleared(address indexed owner);

    error TooLarge(uint256 length);

    function setPointer(bytes calldata encryptedLocator) external {
        if (encryptedLocator.length > MAX_LENGTH) revert TooLarge(encryptedLocator.length);
        _pointers[msg.sender] = encryptedLocator;
        updatedAt[msg.sender] = uint64(block.timestamp);
        emit PointerSet(msg.sender, uint64(block.timestamp));
    }

    function clearPointer() external {
        delete _pointers[msg.sender];
        delete updatedAt[msg.sender];
        emit PointerCleared(msg.sender);
    }

    function getPointer(address owner) external view returns (bytes memory, uint64) {
        return (_pointers[owner], updatedAt[owner]);
    }
}
