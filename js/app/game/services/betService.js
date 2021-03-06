define([
    '../models/bet',
    '../constants/gameStates',
    'slickGrid',
    'slickDataView'
], function (Bet, gameStates) {
    'use strict';

    function BetService(gridService, xhrService, securityService, gameStateService, spreadBotService) {
        this._gridService = gridService;
        this._xhrService = xhrService;
        this._securityService = securityService;
        this._gameStateService = gameStateService;
        this._spreadBotService = spreadBotService;
        this.bets = [];
    }

    BetService.$injector = ['gridService', 'xhrService', 'securityService', 'gameStateService', 'spreadBotService'];

    /**
     * Create Bets Grid
     */
    BetService.prototype.createBetsGrid = function () {
        this.bets.length = 0;

        this.grid = this._gridService.create('#betGrid', [
            {id: 'delete', name: '', field: 'delete', width: 50, cssClass: 'cell-align-center', formatter: this._deleteFormatter.bind(this)},
            {id: 'title', name: 'Market', field: 'title', width: 250, formatter: this._marketFormatter.bind(this)},
            {id: 'direction', name: 'Dir', field: 'direction', width: 100, cssClass: 'cell-align-center', formatter: this._directionFormatter.bind(this)},
            {id: 'stake', name: 'Stake', field: 'stake', width: 100, cssClass: 'cell-align-center', formatter: this._stakeFormatter.bind(this)},
            {id: 'price', name: 'Price', field: 'price', width: 100, cssClass: 'cell-align-center'},
            {id: 'result', name: 'Result', field: 'result', width: 290, formatter: this._resultFormatter.bind(this)}
        ]);

    };

    /**
     * Create a Bet and prepend it to the Bet Grid
     * @param {Object} market
     * @param {Number} stake
     * @param {Boolean} direction
     */
    BetService.prototype.createBet = function (market, stake, price, direction) {
        return this._xhrService.createBet(
                this.gameId,
                this._securityService.loggedInUser.username,
                market.title,
                stake,
                price,
                direction)
        .then(this._bindBetToGrid.bind(this));
    };

    BetService.prototype._bindBetToGrid = function(betObject) {
        var bet = new Bet(
            betObject._id,
            betObject.market,
            betObject.stake,
            betObject.price,
            betObject.direction,
            betObject.result
        );

        this.bets.unshift(bet);

        this.grid.dataView.beginUpdate();
        this.grid.dataView.setItems(this.bets);
        this.grid.dataView.endUpdate();
    };

    BetService.prototype.removeBet = function (bet) {
        if(this._gameStateService.state !== gameStates.BEFORE) {
            return;
        }

        return this._xhrService.deleteBet(this.gameId, this._securityService.loggedInUser.username, bet.id)
            .success(function() {
                this.bets.splice(this.bets.indexOf(bet), 1);
                this.grid.dataView.beginUpdate();
                this.grid.dataView.setItems(this.bets);
                this.grid.dataView.endUpdate();
            }.bind(this));
    };


    BetService.prototype.getBets = function() {
        return this._xhrService.getBets(this.gameId, this._securityService.loggedInUser.username)
            .then(function(json) {
                var bets = json.data;

                this.bets.length = 0;

                this.grid.dataView.beginUpdate();
                this.grid.dataView.setItems(this.bets);
                this.grid.dataView.endUpdate();

                bets.forEach(this._bindBetToGrid.bind(this));
                return bets;
            }.bind(this));
    };

    BetService.prototype._marketFormatter = function (row, col, value) {
        return value + ' <span class="game-tip"></span>';
    };

    BetService.prototype._stakeFormatter = function (row, col, value) {
        return value != null ? '£' + value.toFixed(2) : '';
    };

    BetService.prototype._resultFormatter = function (row, col, value) {
        return value !== undefined ? '&nbsp;&nbsp;£' + value.toFixed(2) + ' <span class="game-tip"></span>' : '';
    };

    BetService.prototype._directionFormatter = function (row, col, value) {
        return value ? 'BUY' : 'SELL';
    };

    BetService.prototype._deleteFormatter = function () {
        var disabled = this._gameStateService.state !== gameStates.BEFORE ? 'disabled' : '';
        return '<button class="btn btn-xs btn-delete"' + disabled + '><span class="glyphicon glyphicon-trash"></span></button>';
    };

    return BetService;

});