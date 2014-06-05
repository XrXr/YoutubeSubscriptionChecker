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

    .directive("bindHeight", function() {
        return {
            link: function(scope, iElement, iAttrs) {
                scope.$watch(
                    function() {
                        return iElement[0].clientHeight;
                    },
                    function(newVal, oldVal) {
                        scope[iAttrs.bindHeight] = newVal;
                    }
                );
            }
        };
    })

    .controller('frame', function($scope, $routeParams, $modal, ChannelList) {
        $scope.chnl = ChannelList;
        $scope.selected_button = null;
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
              controller: subscriptions
            });
        };

        $scope.switch_channel = function(channel_id) {
            $scope.selected_button = channel_id;
            send_dom_event('subscriptions', "get-videos", channel_id);
        };

        document.documentElement.addEventListener("configs", function(event) {
            $scope.configs = JSON.parse(event.detail);
        });

        document.documentElement.addEventListener("subscribed-channels", function(event) {
            ChannelList.update_channels(JSON.parse(event.detail));
        }, false);
    })

    .controller('videos', function($scope, $routeParams, $timeout, $animate, VideoStorage, ChannelList) {
        // this will only bind the dom to what the Array is currenly
        $scope.vs = JSON.parse(JSON.stringify(VideoStorage.videos));
        $scope.v = VideoStorage;

        window.flow = new Masonry(document.querySelector('#video-container'), {
            itemSelector: ".video",
            gutter: 19,
            "isFitWidth": true
        });

        function update_flow() {
            flow.prepended(document.getElementsByClassName("video"));
        }

        $scope.open_video = function(video, event) {
            send_dom_event("videos", "remove-video", video);
            var video_div = event.target.parentElement.parentElement.parentElement;
            $timeout(() => {
                flow.remove(video_div);
                flow.layout();
            });
            VideoStorage.remove_video(video);
            ChannelList.decrease_video_count(video.snippet.channelId);
        };

        document.documentElement.addEventListener("videos", function(event) {
            VideoStorage.update_videos(JSON.parse(event.detail));
            $scope.vs = JSON.parse(JSON.stringify(VideoStorage.videos));
            $scope.$apply();
            $timeout(update_flow);
        });
    })


    .service("VideoStorage", function($rootScope, $timeout) {
        this.videos = [{id:{videoId:123}},{id:{videoId:125}},{id:{videoId:124},snippet:{title:"asdasd"}}];
        this.update_videos = function(new_list) {
            this.videos = new_list;
            $rootScope.$apply();
        };
        var parent = this;
        this.remove_video = function(video) {
            for (var i = parent.videos.length - 1; i >= 0; i--) {
                if (parent.videos[i].id.videoId == video.id.videoId){
                    parent.videos.splice(i, 1);
                    return;
                }
            }
        };
        this.remove_video_by_channel = function(channel_id) {
            for (var i = parent.videos.length - 1; i >= 0; i--) {
                if (parent.videos[i].snippet.channelId == channel_id){
                    parent.videos.splice(i, 1);
                }
            }
        };
    })

    .service("ChannelList", function($rootScope) {
        this.channels = [];
        var parent = this;
        function get_channel_by_id (id) {
            var channel = null;
            parent.channels.some(function (element) {
                if (element.id == id) {
                    channel = element;
                    return true;
                }
                return false;
            });
            return channel;
        }

        this.update_channels = function(new_list) {
            new_list.forEach(function(element) {
                var matching = get_channel_by_id(element.id);
                if (matching){
                    matching.video_count = element.video_count;
                }else{
                    parent.channels.push(element);
                }
            });
            $rootScope.$apply();
        };

        this.decrease_video_count = function(channel_id){
            parent.channels.some(function (element) {
                if (element.id == channel_id) {
                    element.video_count = Math.max(element.video_count - 1, 0);
                    return true;
                }
                return false;
            });
        };

        this.remove_channel = function(channel) {
            parent.channels.splice(parent.channels.indexOf(channel), 1);
        };

        this.total_video_count = function() {
            var sum = 0;
            if (parent.channels){
                parent.channels.forEach(function(elem) {
                    if (elem.video_count){
                        sum += elem.video_count;
                    }
                });
            }
            if (sum <= 0){
                return "";
            }
            return sum;
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

function subscriptions($scope, $modalInstance, $modal, VideoStorage, ChannelList) {
    $scope.chnl = ChannelList;
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
            ChannelList.channels.push(channel);
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
        ChannelList.remove_channel(channel);
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