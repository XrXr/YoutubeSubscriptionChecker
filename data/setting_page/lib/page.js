angular.module('subscription_checker', ['ngRoute','ngAnimate'])
    .config(['$routeProvider', '$locationProvider',
        function($routeProvider, $locationProvider) {
            $routeProvider
                .when('/:channel', {
                    templateUrl: 'partials/subscription.html',
                    controller: 'subscription'
                })
                .otherwise({
                    templateUrl: 'partials/subscription.html',
                    controller: 'subscription'
                });
        }
    ])
    .controller('frame', function($scope, $routeParams) {
        $scope.a = 1;
        $scope.b = 2;
        $scope.params = $routeParams;
        $scope.channels = [{name:"LinusTechTips"}, {name:"sxephil"}, {name:"SourceFed"}];
    })
    .controller('subscription', function($scope) {
        $scope.a = 100;
        $scope.b = 200;
        $scope.videos = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
    });