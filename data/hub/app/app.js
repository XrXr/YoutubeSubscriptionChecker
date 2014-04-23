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
        document.documentElement.addEventListener("subscribed-channels", function(event) {
            $scope.channels = JSON.parse(event.detail); 
            $scope.$apply();
        }, false);
        // $scope.channels = [{title:"LinusTechTips"}, {title:"sxephil"}, {title:"sxephil"}, {title:"SourceFed"}];
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
    $scope.search_result = [];
    $scope.show_loading = false;
    $scope.no_result = false;
    $scope.duplicate = false;
    var clear = false;
    $scope.fit = function(body_height, result_height) {
        if (clear){
            return {};
        }
        return {height: Math.max(body_height, (result_height + 10)) + 'px'};
    };

    $scope.save = function () {
        $modalInstance.close();
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };

    function channel_listeners(channel){
        //register listeners for channel updates
        function add_listener() {
            document.documentElement.removeEventListener("channel-added", arguments.callee, false);
            $scope.channels.push(channel);
            $scope.$apply();
        }

        function duplicate_listener() {
            document.documentElement.removeEventListener("channel-added", add_listener, false);
            document.documentElement.removeEventListener("channel-duplicate", arguments.callee, false);
            $scope.duplicate = true;
            $scope.$apply();
        }
        document.documentElement.addEventListener("channel-added", add_listener, false);
        document.documentElement.addEventListener("channel-duplicate", duplicate_listener, false);
    }

    $scope.add_channel = function(channel) {
        $scope.duplicate = false;
        var event = new CustomEvent('subscriptions');
        event.initCustomEvent("add", true, true, channel);
        document.documentElement.dispatchEvent(event); // tell content script to add the channel
        channel_listeners(channel);
    };

    $scope.remove_channel = function(channel) {
        var event = new CustomEvent('subscriptions');
        event.initCustomEvent("remove", true, true, channel);
        document.documentElement.dispatchEvent(event); 
        $scope.channels.splice($scope.channels.indexOf(channel), 1);
    };

    function search_result_listener (event) {
        var results = JSON.parse(event.detail);
        if (results.length === 0 || results[0] === null){
            clear = true;
            $scope.no_result = true;
        } else {
            $scope.search_result = results;
            clear = false;
            $scope.no_result = false;
        }
        $scope.show_loading = false;
        $scope.$apply();
    }

    $scope.search_channel = function($event) {
        if($event.keyCode == 13){
            var event = new CustomEvent('subscriptions');
            event.initCustomEvent("search", true, true, {});
            document.documentElement.dispatchEvent(event); // tell content script to start the search
            document.documentElement.addEventListener("search-result", search_result_listener, false);
            $scope.search_result = [];
            $scope.show_loading = true;
            $scope.duplicate = false;
            clear = true;
            //super long channel name will extend out of the modal window.

            // $scope.search_result = [{title: "cactus", thumbnail: "http://placekitten.com/200/200"},
            //     {title: "cactuasdasdasdasdasdasdasdaasdasdasdasdsds", thumbnail: "http://placekitten.com/200/200"},
            //     {title: "cactus", thumbnail: "http://placekitten.com/200/200"}
            // ];
        }
    };
}