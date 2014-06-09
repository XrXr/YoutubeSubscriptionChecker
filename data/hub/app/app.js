function send_dom_event (type, name, data) {
    var result_event = new CustomEvent(type);
    result_event.initCustomEvent(name, true, true, data);
    document.documentElement.dispatchEvent(result_event);
}

angular.module('subscription_checker', ['ngRoute', 'ngAnimate', 'ui.bootstrap'])
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
    .directive('masonry', function($timeout, ChannelList, $interval, VideoStorage) {
        return {
            restrict: 'AC',
            link: function(scope, elem, attrs) {
                scope.items = [];
                var container = elem[0];
                var options = angular.extend({
                    itemSelector: '.item'
                }, JSON.parse(attrs.masonry));

                scope.obj = new Masonry(container, options);
                window.expose = scope.obj;

                function indexOf (video, array) {
                    // locate the index of a video in a video array
                    // returns -1 on fail
                    var r = -1;
                    if (video){
                        array.some(function(e, i) {
                            if (e.id.videoId == video.id.videoId){
                                r = i;
                                return true;
                            }
                            return false;
                        });
                    }
                    return r;
                }

                function crude_update (new_list) {
                    var intersection_start = indexOf(VideoStorage.current_view[0], new_list);
                    if (intersection_start !== -1){
                        var intersection_end = indexOf(VideoStorage.current_view
                            [VideoStorage.current_view.length - 1], new_list);
                        VideoStorage.current_view.push(...new_list.slice(intersection_end + 1));
                        VideoStorage.current_view.splice(0, 0,
                            ...new_list.slice(0, intersection_start));
                    }else{
                        VideoStorage.current_view = new_list;
                    }
                    $timeout(()=>{
                        var garbage = scope.obj.getItemElements().filter(function(v) {
                            return v["$$NG_REMOVED"];
                        });
                        garbage.forEach(function(e) {
                            var w = angular.element(e);
                            w.remove();
                        });
                        if (intersection_start === -1){
                            scope.obj.prepended(elem.children());
                        }else{
                            var arr = [].splice.call(elem[0].children);
                            scope.obj.prepended(arr.slice(0, intersection_start));
                            scope.obj.prepended(arr.slice(intersection_end + 1));
                        }
                        scope.obj.reloadItems();
                    });
                }

                function play_leave_animation (intersection_start, intersection_end) {
                    // Create clone elements that are not effected;
                    // by ng-repeat and masonry play a leave animation on them then
                    // destroy them
                    function make_clone (e) {
                        if (!e["$$NG_REMOVED"]){
                            var clone = angular.element(e).clone();
                            clone.css("opacity", "1 !important");
                            clone.on("transitionend", function() {
                                clone.remove();
                            });
                            angular.element(document.querySelector("#dummy")).append(clone);
                            clone.ready(function() {
                                clone.css("opacity", 0);
                                clone.addClass("disappear");
                            });
                        }
                    }
                    var a = scope.obj.getItemElements().slice(0, intersection_start);
                    var b = scope.obj.getItemElements().slice(intersection_end + 1);
                    a.forEach(make_clone);
                    b.forEach(make_clone);
                }

                scope.$watch(function() {
                    return ChannelList.current_channel;
                }, function(new_ch) {
                    var new_list = VideoStorage.videos.filter(
                        function(v) {
                            return v.snippet.channelId == new_ch || new_ch === "";
                        });
                    VideoStorage.clean_current_view();
                    var intersection_start = -1;
                    var intersection_end = -1;
                    var f,l;
                    if (new_list.length > VideoStorage.current_view.length){
                        f = VideoStorage.current_view[0];
                        if (f !== undefined){
                            l = VideoStorage.current_view[VideoStorage.current_view.length - 1];
                            intersection_start = indexOf(f, new_list);
                            if (intersection_start != -1){
                                intersection_end = indexOf(l, new_list);
                                var before = new_list.slice(0, intersection_start);
                                var after = new_list.slice(intersection_end + 1);
                                VideoStorage.current_view.splice(0, 0, ...before);
                                VideoStorage.current_view.push(...after);
                                $timeout(()=>{
                                    var arr = [].slice.call(elem.children());
                                    var garbage = scope.obj.getItemElements().filter(function(v) {
                                        return v["$$NG_REMOVED"];
                                    });
                                    scope.obj.remove(garbage);
                                    scope.obj.layout();
                                    scope.obj.prepended(arr.slice(0, intersection_start));
                                    scope.obj.appended(arr.slice(intersection_end + 1));
                                    scope.obj.reloadItems();
                                });
                            } else {
                                crude_update(new_list);
                            }
                        } else {
                            crude_update(new_list);
                        }
                    } else if (new_list.length < VideoStorage.current_view.length){
                        f = new_list[0];
                        if (f !== undefined){
                            l = new_list[new_list.length - 1];
                            intersection_start = indexOf(f, VideoStorage.current_view);
                            if (intersection_start != -1){
                                intersection_end = indexOf(l, VideoStorage.current_view);
                                var delta = VideoStorage.current_view.length - 1 - intersection_end;
                                play_leave_animation(intersection_start, intersection_end);
                                VideoStorage.current_view.splice(-delta, delta);
                                VideoStorage.current_view.splice(0, intersection_start);
                                $timeout(()=>{
                                    // var elems = scope.obj.getItemElements();
                                    // scope.obj.remove(elems.splice(-delta, delta));
                                    // scope.obj.remove(elems.splice(0, intersection_start));
                                    var garbage = scope.obj.getItemElements().filter(function(v) {
                                        return v["$$NG_REMOVED"];
                                    });
                                    scope.obj.remove(garbage);
                                    scope.obj.layout();
                                    scope.obj.reloadItems();
                                });
                            }else{
                                crude_update(new_list);
                            }
                        } else {
                            crude_update(new_list);
                        }
                    } else {
                        crude_update(new_list);
                    }
                });
            }
        };
    })

    .directive('masonryTile', function($timeout, $animate) {
        return {
            restrict: 'AC',
            link: function(scope, elem) {
                // scope.$on("$destroy", function() {
                //     $animate.addClass(elem, "jojo");
                // });
                var master = elem.parent('*[masonry]:first').scope();
                var masonry = master.obj;
                elem.css("opacity", "0 !important");
                elem.ready(function() {
                    elem.css("opacity", 1);
                });
            }
        };
    })

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

    .controller('frame', function($scope, $routeParams, $modal, $timeout, ChannelList, VideoStorage) {
        $scope.chnl = ChannelList;
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
            var masonry_container = document.querySelector("[masonry]");
            var masonry = Masonry.data(masonry_container);
            ChannelList.current_channel = channel_id;
            // $timeout(()=>{masonry.reloadItems(); masonry.layout();});
            // $scope.vc = angular.copy(VideoStorage.videos);
            // call layout once when initial list is recieved
            // update the current list via delta
            // change the filter
        };

        document.documentElement.addEventListener("configs", function(event) {
            $scope.configs = JSON.parse(event.detail);
        });

        document.documentElement.addEventListener("subscribed-channels", function(event) {
            ChannelList.update_channels(JSON.parse(event.detail));
        }, false);
    })

    .controller('videos', function($scope, $routeParams, $timeout, $animate, VideoStorage, ChannelList) {
        $scope.v = VideoStorage;

        function update_flow() {
            flow.prepended(document.getElementsByClassName("video"));
        }

        $scope.open_video = function(video, event) {
            send_dom_event("videos", "remove-video", video);
            VideoStorage.remove_video(video);
            var masonry_container = document.querySelector("[masonry]");
            var masonry = Masonry.data(masonry_container);
            var video_div = event.target.parentElement.parentElement.parentElement;
            VideoStorage.to_remove.push(angular.element(video_div).scope().video);
            $timeout(()=>{
                masonry.remove(video_div);
                masonry.layout();
                // VideoStorage.current_view.splice(angular.element(video_div).scope().$index, 1);
                // VideoStorage.remove_from_view(video);
            });
            // $animate.addClass(angular.element(video_div), "open-animation", function() {
            //     masonry_container.removeChild(video_div);
            //     $timeout(()=>{
            //         masonry.reloadItems();
            //         masonry.layout();
            //         VideoStorage.remove_from_view(video);
            //     });
            // });
            ChannelList.decrease_video_count(video.snippet.channelId);
        };

        document.documentElement.addEventListener("videos", function(event) {
            VideoStorage.update_videos(JSON.parse(event.detail));
            VideoStorage.current_view = angular.copy(VideoStorage.videos);
            ChannelList.current_channel = "";
            $scope.$apply();
            $timeout(function() {
                var masonry_container = document.querySelector("[masonry]");
                var masonry = Masonry.data(masonry_container);
                masonry.prepended(masonry_container.children);
                masonry.reloadItems();
                masonry.layout();
            });
        });
    })

    .service("VideoStorage", function($rootScope, $timeout) {
        // this.videos = [{id:{videoId:123}},{id:{videoId:125}},{id:{videoId:124},snippet:{title:"asdasd"}}];
        this.videos = [];
        this.current_view = [];
        this.to_remove = [];
        this.update_videos = function(new_list) {
            this.videos = new_list;
            $rootScope.$apply();
        };
        var parent = this;
        this.remove_from_view = function(video) {
            for (var i = parent.current_view.length - 1; i >= 0; i--) {
                if (parent.current_view[i].id.videoId == video.id.videoId){
                    parent.current_view.splice(i, 1);
                    return;
                }
            }
        };

        this.clean_current_view = function() {
            parent.to_remove.forEach(function(v) {
                parent.remove_from_view(v);
            });
            this.to_remove = [];
        };

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
        this.current_channel = "";

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