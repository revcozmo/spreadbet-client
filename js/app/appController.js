define(['./services/loadingService'], function (loadingService) {
    'use strict';

    function MainCtrl($scope, $location, $route, securityService) {
        $scope.$location = $location;
        $scope.loadingService = loadingService;
        $scope.securityService = securityService;
        $scope.$route = $route;

        $scope.go = function (path) {
            $location.path(path);
        };
    }

    MainCtrl.$inject = ['$scope', '$location', '$route', 'securityService'];

    return MainCtrl;
});
