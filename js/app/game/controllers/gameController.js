define([
    'jquery',
    '../models/match',
    '../constants/gameStates',
    '../../services/loadingService',
    '../../services/socketService',
    '../../services/subscriptionService'
], function ($, Match, gameStates, loadingService, socketService, sub) {
    'use strict';

    function GameCtrl($scope, xhrService, marketService, betService, spreadBotService, gameStateService, securityService, assessmentService, $routeParams) {
        // Angular scope
        this.$scope = $scope;

        this.gameStateService = gameStateService;
        this.spreadBotService = spreadBotService;
        this.marketService = marketService;
        this.betService = betService;
        this.securityService = securityService;
        this.assessmentService = assessmentService;
        this.gameStates = gameStates;

        loadingService.setLoading(true);

        marketService.createMarketGrid();

        marketService.grid.slickGrid.onClick.subscribe(function(e, args) {
            var element = $(e.target);

            if(!element.hasClass('game-tip')) {
                return;
            }

            $scope.$apply(function() {
                var dataItem = args.grid.getDataItem(args.row);

                if(args.cell === 0) {
                    spreadBotService.tip = dataItem.description;
                }
                else if(args.cell === 3 ) {
                    spreadBotService.tip = this._getBettingTip(dataItem, 0);
                }
                else if(args.cell === 7) {
                    spreadBotService.tip = this._getBettingTip(dataItem, 1);
                }
                e.stopPropagation();
            }.bind(this));
        }.bind(this));

        marketService.grid.slickGrid.onBeforeEditCell.subscribe(function() {
            return gameStateService.state === gameStates.BEFORE;
        });

        betService.createBetsGrid();

        betService.grid.slickGrid.onClick.subscribe(function(e, args) {
            $scope.$apply(function() {
                var dataItem = args.grid.getDataItem(args.row);
                var element = $(e.target);

                if(args.cell === 0) {
                    betService.removeBet(dataItem);
                }
                else if(args.cell === 1 && element.hasClass('game-tip')) {
                    spreadBotService.tip = this._getBetTip(dataItem);
                }
                else if(args.cell === 5 && element.hasClass('game-tip')) {
                    spreadBotService.tip = this._getResultTip(dataItem);
                }
                e.stopPropagation();
            }.bind(this));
        }.bind(this));

        // get game by game id
        xhrService.getGame($routeParams.gameId)
            .then(this._createGame.bind(this))
            .then(betService.getBets.bind(betService))
            .then(function(bets) {
                if(this.gameStateService.state === gameStates.AFTER) {
                    this._calculateWinnings(bets);
                }
            }.bind(this))
            .then(function() { loadingService.setLoading(false); });

    }

    GameCtrl.$inject = [
        '$scope',
        'xhrService',
        'marketService',
        'betService',
        'spreadBotService',
        'gameStateService',
        'securityService',
        'assessmentService',
        '$routeParams'
    ];

    /**
     * Create instance of game
     * @param {Object} game configuration received from server
     * @private
     */
    GameCtrl.prototype._createGame = function (json) {
        var data = json.data;
        this._gameId = data._id;
        this.gameStateService.state = data.gameState;
        this._createMatch(data.homeTeam, data.awayTeam, data.minutesElapsed, data.matchEvents);
        this.marketService.createMarkets(data.markets, this._gameId);
        this.betService.gameId = this._gameId;
        this.assessmentService.completed = data.completedAssessment;
        if(this.gameStateService.state === gameStates.DURING) {
            this.startSimulation();
        }
    };

    /**
     * Send request to start simulation on server
     * @private
     */
    GameCtrl.prototype.startSimulation = function () {
        this.gameStateService.state = gameStates.DURING;

        $('.grid-canvas button').attr('disabled', true);

        socketService.send(JSON.stringify({
            key: 'startSimulation',
            value: this._gameId
        }));
    };

    /**
     * Un-subscribe from all events when simulation completes
     * @private
     */
    GameCtrl.prototype._endSimulation = function () {
        var loggedInUser = this.securityService.loggedInUser;

        this.gameStateService.state = gameStates.AFTER;
        sub.subscriptionService.unsubscribe(this.matchSubscription);
        this.betService.getBets()
            .then(this._calculateWinnings.bind(this))
            .then(this.securityService.getUser.bind(this.securityService, loggedInUser.username))
            .then(function(user) { loggedInUser.balance = user.balance; });
    };

    GameCtrl.prototype._calculateWinnings = function(bets) {
        if(bets.length === 0) {
            return;
        }

        var pnl = bets.reduce(function(previousValue, currentValue) {
            return previousValue + currentValue.result;
        }, 0);

        if(pnl > 0) {
            this.spreadBotService.tip = 'Congratulations you won £' + Math.abs(pnl).toFixed(2);
        }
        else if(pnl < 0) {
            this.spreadBotService.tip = 'Sorry you lost £' + Math.abs(pnl).toFixed(2);
        }
        else {
            this.spreadBotService.tip = 'You broke even';
        }
    };

    /**
     * Create Match instance and put it on the scope
     * @param homeTeam
     * @param awayTeam
     * @private
     */
    GameCtrl.prototype._createMatch = function (homeTeam, awayTeam, minutesElapsed, matchEvents) {
        this.match = new Match(homeTeam, awayTeam, minutesElapsed, matchEvents);

        // subscribe to simulated match events
        this.matchSubscription = sub.subscriptionService.subscribe('matchEvent-' + this._gameId, this._handleMatchEvent.bind(this));
    };

    /**
     * Update Match with event delta
     * @param matchEvent
     * @private
     */
    GameCtrl.prototype._handleMatchEvent = function (matchEvent) {
        this.$scope.$apply(function () {

            if (matchEvent.type === 'FullTime') {
                this._endSimulation();
            }

            this.match.setEvent(matchEvent);

        }.bind(this));
    };

    GameCtrl.prototype._getMarketTip = function (market) {
        var marketType = market.unit;
        var buy = market.buyPrice;
        var sell = market.sellPrice;
        var homeTeam = this.match.homeTeam.name;
        var awayTeam = this.match.awayTeam.name;

        return market.description + '<br><br>This is a market on the number of ' + marketType + ' in the ' + homeTeam + ' v ' + awayTeam + ' game. ' +
            'The prediction is ' + buy + '  – ' + sell + '. If you decide there are going to be more ' +
            'than ' + sell + ' ' + marketType + ', you can buy at ' + sell + '. On the other hand, if you think ' +
            'there will be less than ' + buy + ' ' + marketType + ' you can sell at ' + buy + '.';
    };


    GameCtrl.prototype._getBettingTip = function (market, direction) {
        if(market.id === 1) {
            return this._getWinningMarginTip(market, direction);
        }

        var marketType = market.unit;
        var price = direction ? market.buyPrice : market.sellPrice;
        var buttonName = direction ? 'buy' : 'sell';
        var directionPast = direction ? 'bought' : 'sold';
        var belowAbove = direction ? 'below' : 'above';
        var aboveBelow = direction ? 'above' : 'below';
        var moreLess = direction ? 'more' : 'less';

        return market.description + '<br><br>Clicking the ' + buttonName + ' button allows you to enter a stake on this market. Say, for example, you enter ' +
            'a £5 stake, this means you have '  + directionPast  + ' ' + marketType + 's at ' + price + ' for £5 a ' + marketType + '.' +
            ' In order to make a profit you require ' + moreLess + ' than ' + price + ' ' +  marketType + 's during the match. When the match finishes' +
            ', for every ' + marketType + ' there has been ' + aboveBelow + ' ' + price + ' you will make £5, but for every ' +  marketType  +
            ' ' + belowAbove + ' ' + price + '  you will lose £5.';
    };

    GameCtrl.prototype._getWinningMarginTip = function (market, direction) {
        var price = direction ? market.buyPrice : market.sellPrice;
        var buttonName = direction ? 'buy' : 'sell';
        var directionPast = direction ? 'bought' : 'sold';
        var belowAbove = direction ? 'below' : 'above';
        var aboveBelow = direction ? 'above' : 'below';
        var moreLess = direction ? 'more' : 'less';

        return market.description + '<br><br>Clicking the ' + buttonName + ' button allows you to enter a stake on this market. Say, for example, you enter ' +
            'a £5 stake, this means you have '  + directionPast  + ' the winning margin at ' + price + ' for £5.' +
            ' In order to make a profit you require the winning margin to be ' + moreLess + ' than ' + price + '. When the match finishes' +
            ', if the winning margin is ' + aboveBelow + ' ' + price + ' you will make £5 for every goal, but if the winning margin is ' + belowAbove + ' ' + price + '' +
            ' you will lose £5 for every goal';
    };

    GameCtrl.prototype._getBetTip = function (market) {
        var marketId = this.marketService.markets.filter(function(m) { return m.title === market.title; })[0].id || '';

        if(marketId === 1) {
            return this._getWinningMarginBetTip(market);
        }

        var marketType = this.marketService.markets.filter(function(m) { return m.title === market.title; })[0].unit || '';
        var price = market.price;
        var stake = market.stake;
        var directionPast = market.direction ? 'bought' : 'sold';
        var belowAbove = market.direction ? 'below' : 'above';
        var aboveBelow = market.direction ? 'above' : 'below';
        var moreLess = market.direction ? 'more' : 'less';

        return 'You have '  + directionPast  + ' ' + marketType + 's at ' + price + ' for £' + stake + ' a ' + marketType + '.' +
            ' In order to make a profit you require ' + moreLess + ' than ' + price + ' ' +  marketType + 's during the match. When the match finishes' +
            ', for every ' + marketType + ' there has been ' + aboveBelow + ' ' + price + ' you will make £' + stake + ', but for every ' +  marketType  +
            ' ' + belowAbove + ' ' + price + '  you will lose £' + stake + '.';
    };

    GameCtrl.prototype._getWinningMarginBetTip = function (market) {
        var price = market.price;
        var stake = market.stake;
        var directionPast = market.direction ? 'bought' : 'sold';
        var belowAbove = market.direction ? 'below' : 'above';
        var aboveBelow = market.direction ? 'above' : 'below';
        var moreLess = market.direction ? 'more' : 'less';

        return 'You have '  + directionPast  + ' the winning margin at ' + price + ' for £' + stake + '.' +
            ' In order to make a profit you require the winning margin to be ' + moreLess + ' than ' + price + '. When the match finishes' +
            ', if the winning margin is ' + aboveBelow + ' ' + price + ' you will make £' + stake + ' for every goal, but if the winning margin is' +
            ' ' + belowAbove + ' ' + price + '  you will lose £' + stake + ' per goal.';
    };

    GameCtrl.prototype._getResultTip = function (bet) {
        var market = this.marketService.markets.filter(function(m) { return m.title === bet.title; })[0];
        var marketType = market.unit || '';

        if(bet.result === 0) {
            return 'You broke even on this bet because there were the same amount of ' + marketType + 's as predicted';
        }

        var result = Math.abs(bet.result);
        var wonLost = bet.result > 0 ? 'won' : 'lost';
        var scores = market.soFar.toString().split("-");
        var soFar = market.soFar;

        if(scores.length === 2) {
            var homeScore = parseInt(scores[0]);
            var awayScore = parseInt(scores[1]);
            soFar = Math.abs(homeScore - awayScore);
        }

        soFar = Math.abs(soFar - bet.price).toFixed(1);

        var moreFewer;

        if(bet.direction) {
            moreFewer = bet.result > 0 ? 'more' : 'fewer';
        } else {
            moreFewer = bet.result < 0 ? 'more' : 'fewer';
        }

        return 'You ' + wonLost +' £' + result + ' because there were ' + soFar + ' ' + moreFewer + ' ' + marketType + 's than predicted at £' +
            bet.stake + ' a ' + marketType + '.';
    };

    return GameCtrl;
});

