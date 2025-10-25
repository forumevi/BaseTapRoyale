// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ClickGame {
    mapping(address => uint256) public clicks;
    address public sponsor;

    event Clicked(address indexed user, uint256 total);
    event SponsorUpdated(address indexed newSponsor);

    modifier onlySponsor() {
        require(msg.sender == sponsor, "Not sponsor");
        _;
    }

    constructor(address _sponsor) {
        sponsor = _sponsor;
        emit SponsorUpdated(_sponsor);
    }

    function setSponsor(address _sponsor) external onlySponsor {
        sponsor = _sponsor;
        emit SponsorUpdated(_sponsor);
    }

    /// @notice Normal tap: user pays gas on Base mainnet
    function tap() external {
        unchecked { clicks[msg.sender] += 1; }
        emit Clicked(msg.sender, clicks[msg.sender]);
    }

    /// @notice Sponsored tap executed by the sponsor on behalf of user
    function tapFor(address user) external onlySponsor {
        unchecked { clicks[user] += 1; }
        emit Clicked(user, clicks[user]);
    }

    function getClicks(address user) external view returns (uint256) {
        return clicks[user];
    }
}
