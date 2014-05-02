angular.module('subscription_checker', ['ngRoute','ngAnimate', 'ui.bootstrap'])
    .config(['$routeProvider', '$locationProvider',
        function($routeProvider, $locationProvider) {
            $routeProvider
                .when('/:channel', {
                    templateUrl: 'partials/videos.html',
                    controller: 'videos'
                })
                .otherwise({
                    templateUrl: 'partials/videos.html',
                    controller: 'videos'
                });
        }
    ])

    .controller('frame', function($scope, $routeParams, $modal, VideoStorage) {
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

        $scope.switch_channel = function(channel_id) {
            var event = new CustomEvent('subscriptions');
            event.initCustomEvent("get-videos", true, true, channel_id);
            document.documentElement.dispatchEvent(event); 
        };

        document.documentElement.addEventListener("videos", function(event) {
            VideoStorage.update_videos(JSON.parse(event.detail)); 
        });

        document.documentElement.addEventListener("subscribed-channels", function(event) {
            $scope.channels = JSON.parse(event.detail); 
            $scope.$apply();
        }, false);
        // $scope.channels = [{title:"LinusTechTips"}, {title:"sxephil"}, {title:"sxephil"}, {title:"SourceFed"}];
    })

    .controller('videos', function($scope, $routeParams, VideoStorage) {
        $scope.vs = VideoStorage;

        $scope.open_video = function(video) {
            VideoStorage.remove_video(video);
            
            //https://www.youtube.com/watch?v={{video.id.videoId}}
            //remove the video from video storage
            //tell main to remove
            //main open the link in new tab
        };
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
    .service("VideoStorage", function($rootScope) {
        this.videos = [];
        this.update_videos = function(new_list) {
            this.videos = new_list;
            $rootScope.$apply();
        };
        var parent = this;
        this.remove_video = function(video) {
            parent.videos.some(function(element, index) {
                if (element.id.videoId == video.id.videoId){
                    parent.videos.splice(index, 1);
                    $rootScope.$apply();
                    return true;
                }
                return false;
            });
            var event = new CustomEvent('videos');
            event.initCustomEvent("remove-video", true, true, video);
            document.documentElement.dispatchEvent(event);

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
        event.initCustomEvent("add-channel", true, true, channel);
        document.documentElement.dispatchEvent(event); // tell content script to add the channel
        channel_listeners(channel);
    };

    $scope.remove_channel = function(channel) {
        var event = new CustomEvent('subscriptions');
        event.initCustomEvent("remove-channel", true, true, channel);
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
            event.initCustomEvent("search-channel", true, true, {});
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