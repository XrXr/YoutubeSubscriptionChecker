angular.module('subscription_checker', ['ngRoute','ngAnimate', 'ui.bootstrap'])
    .config(['$routeProvider', '$locationProvider',
        function($routeProvider, $locationProvider) {
            $routeProvider
                .when('/:channel', {
                    templateUrl: 'partials/videos.html',
                    controller: 'subscription'
                })
                .otherwise({
                    templateUrl: 'partials/videos.html',
                    controller: 'subscription'
                });
        }
    ])
    .controller('frame', function($scope, $routeParams, $modal) {
        $scope.open_settings = function() {
            var modalInstance = $modal.open({
              templateUrl: 'partials/settings.html',
              controller: settings,
            });
        };
        $scope.open_subscriptions = function() {
            var modalInstance = $modal.open({
              templateUrl: 'partials/subscriptions.html',
              controller: subscriptions,
              resolve: {
                channels: function () {
                    return $scope.channels;
                }
              }
            });
        };
        $scope.params = $routeParams;
        $scope.channels = [{name:"LinusTechTips"}, {name:"sxephil"}, {name:"sxephil"}, {name:"SourceFed"}];
    })
    .controller('subscription', function($scope) {
        $scope.a = 100;
        $scope.b = 200;
        $scope.videos = [1,2,3,4,5,6,7,8,9,10,11,12,13,12,15,16,17,18,19,20];
    })
    .directive("bindHeight", function() {
        return {
            link: function(scope, iElement, iAttrs) {
                scope.$watch(
                    function() {
                        return iElement[0].clientHeight;},
                    function(newVal, oldVal) {
                        scope[iAttrs.bindHeight] = newVal;
                    }
                );    
            }
        };
    })
    .directive("bindWidth", function() {
        return {
            link: function(scope, iElement, iAttrs) {
                scope.$watch(
                    function() {
                        return iElement[0].clientWidth;},
                    function(newVal, oldVal) {
                        scope[iAttrs.bindWidth] = newVal;
                    }
                );    
            }
        };
    });

function settings($scope, $modalInstance) {
    $scope.save = function () {
        $modalInstance.close();
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };
}

function subscriptions($scope, $modalInstance, $modal, channels) {
    $scope.channels = channels;
    $scope.fit = function(body_height, result_height) {
        return {height: Math.max(body_height, result_height + 10) + 'px'};
    };
    $scope.save = function () {
        $modalInstance.close();
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };

    $scope.search_channel = function($event) {
        if($event.keyCode == 13){
            var event = new CustomEvent('subscriptions');
            event.initCustomEvent("search", true, true, {});
            document.documentElement.dispatchEvent(event); // tell content script to start the search
            // $scope.search_result = [{title: "cactus", thumbnail: "http://placekitten.com/200/200"},
            //     {title: "cactuasdasdasdasdasdasdasdaasdasdasdasdsds", thumbnail: "http://placekitten.com/200/200"},
            //     {title: "cactus", thumbnail: "http://placekitten.com/200/200"}
            // ];
        }
        document.documentElement.addEventListener("search-result", function(event) {
            // $scope.search_result = [{title: "cactus", thumbnail: "http://placekitten.com/200/200"},
            //         {title: "cactuasdasdasdasdasdasdasdaasdasdasdasdsds", thumbnail: "http://placekitten.com/200/200"},
            //         {title: "cactus", thumbnail: "http://placekitten.com/200/200"}
            //     ];
            $scope.search_result = JSON.parse(event.detail);
            $scope.$apply();
        }, false);
    };
}

function clone(obj) {
    if (null === obj || "object" != typeof obj) return obj;
    var copy = obj.constructor();
    for (var attr in obj) {
        if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
    }
    return copy;
}