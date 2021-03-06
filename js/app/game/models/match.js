define([
    'moment',
    '../constants/gameStates',
    '../constants/teamConstant',
], function (moment, gameStates, teams) {
    'use strict';

    function Match(homeTeam, awayTeam, minutesElapsed, matchEvents) {
        this.clock = minutesElapsed;

        this.homeTeam = homeTeam;
        this.awayTeam = awayTeam;

        this.matchEvents = [];

        this.teamEvents = {};
        this.teamEvents[teams.HOME] = {};
        this.teamEvents[teams.AWAY] = {};

        for (var i = 0; i < matchEvents.length; i++) {
            this.setEvent(matchEvents[i]);
        }
    }

    /**
     *
     * @param {Object} matchEvent
     * @private
     */
    Match.prototype.setEvent = function (matchEvent) {
        this.clock = matchEvent.time;

        this.matchEvents.push(matchEvent);

        if (!this.teamEvents[matchEvent.team][matchEvent.type]) {
            this.teamEvents[matchEvent.team][matchEvent.type] = 0;
        }
        this.teamEvents[matchEvent.team][matchEvent.type]++;
    };

    return Match;

});