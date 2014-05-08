function send_dom_event (type, name, data) {
    var result_event = new CustomEvent(type);
    result_event.initCustomEvent(name, true, true, data);
    document.documentElement.dispatchEvent(result_event);    
}

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
              controller: "settings as s",
              resolve: {
                configs: function () {
                    return $scope.configs;
                }
              }
            });
            modalInstance.result.then(function (configs) {
                $scope.configs = configs;
                send_dom_event('settings', "update_configs", configs);
            }, function () {});
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
            send_dom_event('subscriptions', "get-videos", channel_id);
        };

        document.documentElement.addEventListener("videos", function(event) {
            VideoStorage.update_videos(JSON.parse(event.detail)); 
        });

        document.documentElement.addEventListener("configs", function(event) {
            $scope.configs = JSON.parse(event.detail); 
        });

        document.documentElement.addEventListener("subscribed-channels", function(event) {
            $scope.channels = JSON.parse(event.detail);
            // $scope.channels.forEach(function(element) {
            //     var d = new Date();
            //     d.setTime(element.last_checked);
            //     element.last_checked = d;
            // });
            $scope.$apply();
        }, false);
    })

    .controller('videos', function($scope, $routeParams, VideoStorage) {
        $scope.vs = VideoStorage;

        $scope.open_video = function(video) {
            VideoStorage.remove_video(video);
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
            send_dom_event("videos", "remove-video", video);
        };
        this.remove_video_by_channel = function(channel_id) {
            for (var i = parent.videos.length - 1; i >= 0; i--) {
                if (parent.videos[i].snippet.channelId == channel_id){
                    parent.videos.splice(i, 1);
                }
            }
            $rootScope.$apply();
        };
    });
    
function settings($modalInstance, configs) {
    this.configs = {};
    angular.extend(this.configs, configs);  // clone it
    this.interval_class = "";
    this.less_than_5 = false;
    this.bad_input = false;
    this.valid = true;

    function isNumber(n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    }

    var parent = this;
    this.validate = function(value) {
        parent.interval_class = "";
        parent.less_than_5 = false;
        parent.bad_input = false;
        parent.valid = true;
        if (isNumber(value)){
            if (Number(value) < 5){
                parent.valid = false;
                parent.less_than_5 = true;
                parent.interval_class = "has-error";
            }
        }else{
            parent.valid = false;
            parent.bad_input = true;
            parent.interval_class = "has-error";
        }
    };

    this.save = function () {
        $modalInstance.close(parent.configs);
    };

    this.cancel = function () {
        $modalInstance.dismiss('cancel');
    };

    this.valid = true;
}

function subscriptions($scope, $modalInstance, $modal, channels, VideoStorage) {
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

    function register_channel_listeners(channel){
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
        send_dom_event('subscriptions', "add-channel", channel);
        register_channel_listeners(channel);
    };

    $scope.remove_channel = function(channel) {
        send_dom_event('subscriptions', "remove-channel", channel);
        $scope.channels.splice($scope.channels.indexOf(channel), 1);
        VideoStorage.remove_video_by_channel(channel.id);
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
            send_dom_event('subscriptions', "search-channel", null);
            document.documentElement.addEventListener("search-result", search_result_listener, false);
            $scope.search_result = [];
            $scope.show_loading = true;
            $scope.duplicate = false;
            clear = true;
            //super long channel name will extend out of the modal window.
        }
    };
}