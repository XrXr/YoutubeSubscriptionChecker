/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
function refresh_masonry () {
    var masonry_container = document.querySelector("[masonry]");
    var masonry = Masonry.data(masonry_container);
    setTimeout(function() {
        try{
            masonry.remove(masonry.getItemElements());
            masonry.layout();
            masonry.prepended(masonry_container.children);
        } catch(err) {
            masonry.reloadItems();
            masonry.layout();
        }
    });
}

angular.module('subscription_checker', ['ngAnimate', 'ui.bootstrap'])
    .run(function(ConfigManager, Bridge) {
        Bridge.on("config", function(event) {
            var config_and_filters = JSON.parse(event.detail);
            var new_config = config_and_filters.config;
            new_config.filters = config_and_filters.filters;
            ConfigManager.update_config(new_config);
        });
    })

    .directive('videoCanvas', function() {
        return {
            templateUrl: "partials/videos.html"
        };
    })

    .directive('masonry', function($timeout, ChannelList, ConfigManager, VideoStorage) {
        return {
            restrict: 'AC',
            link: function(scope, elem, attrs) {
                scope.items = [];
                var container = elem[0];
                var options = angular.extend({
                    itemSelector: '.item'
                }, JSON.parse(attrs.masonry));

                scope.create_instance = function (enable_transition) {
                    if (scope.obj) {
                        scope.obj.destroy();
                    }
                    options.transitionDuration = 0;
                    if (enable_transition) {
                        options.transitionDuration = '0.4s';
                    }
                    scope.obj = new Masonry(container, options);
                    window.expose = scope.obj;
                };
                //angular.element(document.querySelector('[masonry]')).scope().create_instance(true);
                if (ConfigManager.config.animations === undefined) {
                    // Only set this if the single from add-on is not here yet
                    // yay single threaded JavaScript
                    ConfigManager.config.animations = true;
                }
                scope.create_instance(true);

                function collect_garbage () {
                    var garbage = scope.obj.getItemElements().
                    filter(function(v) {
                        return v["$$NG_REMOVED"];
                    });
                    try{
                        //this might fail when the element is already removed from the dom
                        scope.obj.remove(garbage);
                    } catch(_) {
                        scope.obj.reloadItems();
                    }
                    garbage.forEach((e)=>{angular.element(e).remove();});
                    scope.obj.layout();
                }

                function v_eq (a, b) {
                    return a.video_id == b.video_id;
                }

                function indexOf (video, array) {
                    // locate the index of a video in a video array
                    // returns -1 on fail
                    var r = -1;
                    if (video) {
                        array.some(function(e, i) {
                            if (e.video_id == video.video_id) {
                                r = i;
                                return true;
                            }
                            return false;
                        });
                    }
                    return r;
                }

                function history_update (new_list) {
                    VideoStorage.current_view = new_list;
                    $timeout(_ => {
                        scope.obj.reloadItems();
                        scope.obj.layout();
                    });
                }

                function crude_update (new_list) {
                    var intersection_start = indexOf(VideoStorage.current_view[0], new_list);
                    if (intersection_start !== -1) {
                        var intersection_end = indexOf(VideoStorage.current_view
                            [VideoStorage.current_view.length - 1], new_list);
                        VideoStorage.current_view.push(...new_list.slice(intersection_end + 1));
                        VideoStorage.current_view.splice(0, 0,
                            ...new_list.slice(0, intersection_start));
                    } else {
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
                        if (intersection_start === -1) {
                            scope.obj.prepended(elem.children());
                        } else {
                            var arr = [].splice.call(elem[0].children);
                            scope.obj.prepended(arr.slice(0, intersection_start));
                            scope.obj.appended(arr.slice(intersection_end + 1));
                        }
                        scope.obj.reloadItems();
                        scope.obj.layout();
                    });
                }

                function play_leave_animation (intersection_start, intersection_end, len) {
                    // Create clone elements that are not effected;
                    // by ng-repeat and masonry play a leave animation on them then
                    // destroy them
                    if (!ConfigManager.config.animations) {
                        return;
                    }
                    angular.element(document.querySelector("#dummy")).empty();
                    function make_clone (e) {
                        if (!e["$$NG_REMOVED"]) {
                            var clone = angular.element(e).clone();
                            clone.on("animationend", function() {
                                clone.remove();
                            });
                            // save angular some work
                            clone.removeAttr("masonry-tile");
                            angular.element(document.querySelector("#dummy")).append(clone);
                            clone.ready(function() {
                                clone.addClass("disappear");
                            });
                        }
                    }
                    var after_end;
                    if (len) {
                        after_end = scope.obj.getItemElements().slice(intersection_end,
                            intersection_end + len);
                        after_end.forEach(make_clone);
                        return;
                    }
                    var before_start = scope.obj.getItemElements().slice(0, intersection_start);
                    after_end = scope.obj.getItemElements().slice(intersection_end + 1);
                    before_start.forEach(make_clone);
                    after_end.forEach(make_clone);
                }

                function history_filter(new_ch, video) {
                    if (video.channel_id == new_ch || new_ch === "") {
                        delete video.$$hashKey;
                        return true;
                    }
                    return false;
                }
                // repeating for max efficiency
                function normal_filter (new_ch, video) {
                    if (video.channel_id == new_ch || new_ch === "") {
                        return true;
                    }
                    return false;
                }

                scope.switch_channel = function(new_ch) {
                    var new_list = VideoStorage.history_mode ?
                        VideoStorage.videos.filter(
                            history_filter.bind(null, new_ch)) :
                        VideoStorage.videos.filter(
                            normal_filter.bind(null, new_ch));
                    if (VideoStorage.history_mode) {
                        return history_update(new_list);
                    }
                    VideoStorage.clean_current_view();
                    var intersection_start = -1;
                    var intersection_end = -1;
                    var f,l;
                    if (new_list.length > VideoStorage.current_view.length) {
                        f = VideoStorage.current_view[0];
                        intersection_start = indexOf(f, new_list);
                        if (intersection_start != -1) {
                            l = VideoStorage.current_view[VideoStorage.current_view.length - 1];
                            intersection_end = indexOf(l, new_list);
                            var before = new_list.slice(0, intersection_start);
                            var after = new_list.slice(intersection_end + 1);
                            VideoStorage.current_view.splice(0, 0, ...before);
                            VideoStorage.current_view.push(...after);
                            collect_garbage();
                            $timeout(()=>{
                                var arr = [].slice.call(elem.children());
                                scope.obj.prepended(arr.slice(0, intersection_start));
                                scope.obj.appended(arr.slice(intersection_end + 1));
                                scope.obj.layout();
                                // $timeout(scope.obj.reloadItems);
                            });
                        } else {
                            return crude_update(new_list);  //squeeze some performance
                        }
                    } else if (new_list.length < VideoStorage.current_view.length) {
                        f = new_list[0];
                        intersection_start = indexOf(f, VideoStorage.current_view);
                        if (intersection_start != -1) {
                            l = new_list[new_list.length - 1];
                            intersection_end = indexOf(l, VideoStorage.current_view);
                            var delta = VideoStorage.current_view.length - 1 - intersection_end;
                            // this tests if the intersection is compelete.
                            if (!v_eq(VideoStorage.current_view
                                [intersection_start + (new_list.length - 1)], l)) {
                                // a block was removed from the middle
                                var intersecting = true;
                                var i = 0;
                                // walk through the list until intersection ends
                                while (intersecting) {
                                    i++;
                                    intersecting = v_eq(new_list[i],
                                        VideoStorage.current_view[intersection_start + i]);
                                }
                                var size_diff = VideoStorage.current_view.length - new_list.length;
                                play_leave_animation(null, i + intersection_start, size_diff);
                                VideoStorage.current_view.splice(
                                    i + intersection_start, size_diff);
                            } else {
                                // remove from front and/or back
                                play_leave_animation(intersection_start, intersection_end);
                                VideoStorage.current_view.splice(-delta, delta);
                                VideoStorage.current_view.splice(0, intersection_start);
                            }
                            $timeout(()=>{
                                // var elems = scope.obj.getItemElements();
                                // scope.obj.remove(elems.splice(-delta, delta));
                                // scope.obj.remove(elems.splice(0, intersection_start));
                                collect_garbage();
                                scope.obj.layout();
                            });
                        } else {
                            return crude_update(new_list);
                        }
                    } else {
                        crude_update(new_list);
                    }
                };

                scope.$watch(function() {
                    return ChannelList.current_channel;
                }, scope.switch_channel);
            }
        };
    })

    .directive("selectIndex", function ($parse) {
        return {
            link: function(scope, elem, attrs) {
                var setter = $parse(attrs.selectIndex).assign;
                scope.$watch(function() {
                    return elem[0].selectedIndex;
                }, function(newVal) {
                    setter(scope, newVal);
                });
            }
        };
    })

    .directive('masonryTile', function() {
        return {
            restrict: 'AC',
            link: function(scope, elem) {
                var master = elem.parent('*[masonry]:first').scope();
                var masonry = master.obj;
                elem.css("opacity", 0);
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
                    function(newVal) {
                        scope[iAttrs.bindHeight] = newVal;
                    }
                );
            }
        };
    })

    /*
      Responsible for communication with the add-on. This factory guarantees
      that only one listener is register for any given event name at a time
    */
    .factory("Bridge", function() {
        var registered = {};
        function on (name, listener) {
                document.documentElement.
                    removeEventListener(name, registered[name]);
                registered[name] = listener;
                document.documentElement.addEventListener(name, listener);
        }

        function emit (name, data) {
            document.documentElement.
                dispatchEvent(new CustomEvent(name, {detail: data}));
        }

        function once (name, listener) {
            function wrapper () {
                listener();
                documente.documentElement.removeEventListener(name, wrapper);
            }
            on(name, wrapper);
        }

        function removeListener (name) {
            document.documentElement.
                removeEventListener(name, registered[name]);
            registered[name] = null;
        }

        return {
            on: on,
            once: once,
            emit: emit,
            removeListener: removeListener
        };
    })

    .service("VideoStorage", function() {
        var parent = this;
        var main = [];
        var history = [];

        this.videos = [];
        this.current_view = [];
        this.to_remove = [];
        this.history_mode = false;

        function update_videos (new_list) {
            parent.videos = new_list;
            parent.current_view = angular.copy(new_list);
            parent.to_remove = [];
        }

        this.switch_to = function(target) {
            parent.history_mode = target === "history";
            if (target === "main") {
                return update_videos(main);
            }
            update_videos(history);
        };

        this.new_main = function(new_list) {
            main = new_list;
        };

        this.new_history = function(new_list) {
            history = new_list;
        };

        function get_video_by_id (id, array) {
            var video = null;
            array.some(function(elem) {
                if (elem.video_id == id) {
                    video = elem;
                    return true;
                }
                return false;
            });
            return video;
        }

        this.remove_from_view = function(video) {
            for (var i = parent.current_view.length - 1; i >= 0; i--) {
                if (parent.current_view[i].video_id == video.video_id) {
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

        this.update_duration = function(id, duration) {
            // update the video in the back storage
            var video = get_video_by_id(id, parent.videos);
            if (video && video.duration === "") {
                video.duration = duration;
            }
            // update the video in current view
            video = get_video_by_id(id, parent.current_view);
            if (video && video.duration === "") {
                video.duration = duration;
            }
        };

        function add_history (video) {
            history.unshift(video);
            if (history.length >= 50) {
                history.pop();
            }
        }

        this.remove_video = function(video) {
            for (var i = parent.videos.length - 1; i >= 0; i--) {
                if (parent.videos[i].video_id == video.video_id) {
                    parent.videos.splice(i, 1);
                    parent.to_remove.push(video);
                    add_history(video);
                    return true;
                }
            }
            return false;
        };

        this.remove_video_by_channel = function(channel_id) {
            for (var i = parent.videos.length - 1; i >= 0; i--) {
                if (parent.videos[i].channel_id == channel_id) {
                    parent.videos.splice(i, 1);
                }
            }
        };

        this.toggle_history = function() {
            parent.history_mode = !parent.history_mode;
            var target = parent.history_mode ? "history" : "main";
            parent.switch_to(target);
        };
    })

    .service("ConfigManager", function($animate, Bridge) {
        this.config = {};
        var parent = this;
        this.update_config = function(new_config) {
            // call $animate.enabled
            // remake masonry instance
            $animate.enabled(new_config.animations);
            if (new_config.animations != parent.config.animations) {
                angular.element(document.querySelector('[masonry]')).
                    scope().create_instance(new_config.animations);
            }
            parent.config = new_config;
        };
    })

    .service("ChannelList", function($rootScope, VideoStorage) {
        this.channels = [];
        this.name_list = [];
        this.current_channel = "";
        // for (var i = 0; i < 100; i++) {
        //     this.channels.push({title: String.fromCharCode(65 + Math.random() * 57,
        //                                  65 + Math.random() * 57,
        //                                  65 + Math.random() * 57)});
        // }
        var parent = this;
        function get_channel_by_id (id) {
            for (var channel of parent.channels) {
                if (channel.id == id) {
                    return channel;
                }
            }
        }

        this.get_channel_by_id = get_channel_by_id;

        this.update_video_count = function() {
            for (var c of parent.channels) {
                c.video_count = 0;
            }
            for (var v of VideoStorage.videos) {
                get_channel_by_id(v.channel_id).video_count++;
            }
        };

        this.update_channels = function(new_list) {
            // This method will update the channel list
            // returns whether the new_list is empty
            for (var element of new_list) {
                var matching = get_channel_by_id(element.id);
                if (matching) {
                    matching.video_count = element.video_count;
                } else {
                    parent.channels.push(element);
                }
            }
            parent.name_list = parent.channels.map(channel => channel.title);
            $rootScope.$apply();
            return new_list.length === 0;
        };

        this.decrease_video_count = function(channel_id) {
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
            if (parent.channels) {
                parent.channels.forEach(function(elem) {
                    if (elem.video_count) {
                        sum += elem.video_count;
                    }
                });
            }
            if (sum <= 0) {
                return "";
            }
            return sum;
        };
    })

    .controller('frame', function($scope, $modal, $timeout, ChannelList, VideoStorage, ConfigManager, Bridge) {
        $scope.chnl = ChannelList;
        $scope.vs = VideoStorage;

        var setting_modal_opened = false;
        function set_close () {
            setting_modal_opened = false;
        }
        $scope.open_settings = function() {
            if (setting_modal_opened) {
                return;  // don't open multiple
            }
            setting_modal_opened = true;
            $modal.open({
              templateUrl: 'partials/settings.html',
              controller: "settings"
            }).result.then(set_close, set_close);
        };

        $scope.open_subscriptions = function() {
            $modal.open({
              templateUrl: 'partials/subscriptions.html',
              controller: "subscriptions"
            });
        };

        $scope.switch_channel = function(channel_id) {
            ChannelList.current_channel = channel_id;
        };

        $scope.toggle_history = function() {
            VideoStorage.toggle_history();
            angular.element(document.querySelector('[masonry]')).
                    scope().create_instance(
                        VideoStorage.history_mode ?
                        false : ConfigManager.config.animations);
            ChannelList.current_channel = "";
            ChannelList.update_video_count();
            refresh_masonry();
        };

        Bridge.on("open-settings", event => {
            $scope.open_settings();
        });

        Bridge.on("subscribed-channels", function(event) {
            if (ChannelList.update_channels(JSON.parse(event.detail))) {
                $scope.open_subscriptions();
            }
        }, false);
    })

    .controller('videos', function($scope, $timeout, VideoStorage, ChannelList, Bridge) {
        $scope.v = VideoStorage;

        $scope.open_video = function(video, event) {
            if (VideoStorage.history_mode) {
                return Bridge.emit("open-video", video);
            }
            if (VideoStorage.remove_video(video)) {
                var event_name = event.ctrlKey ? "skip-video" : "remove-video";
                Bridge.emit(event_name, video);
                var masonry_container = document.querySelector("[masonry]");
                var masonry = Masonry.data(masonry_container);
                var video_div = event.target.parentElement.parentElement.parentElement;
                $timeout(()=>{
                    masonry.remove(video_div);
                    masonry.layout();
                });
                ChannelList.decrease_video_count(video.channel_id);
            }
        };

        Bridge.on("videos", function(event) {
            var details = JSON.parse(event.detail);
            VideoStorage.new_main(details[0]);
            VideoStorage.new_history(details[1]);
            VideoStorage.switch_to("main");
            ChannelList.current_channel = "";
            ChannelList.update_video_count();
            $scope.$apply(refresh_masonry);
        });

        Bridge.on("duration-update", function(event) {
            var detail = JSON.parse(event.detail);
            VideoStorage.update_duration(detail.id, detail.duration);
            $scope.$apply();
        });
    })

    .controller ("settings", function ($scope, $modalInstance, ConfigManager, ChannelList, VideoStorage, Bridge) {
        $scope.channels = ChannelList;
        $scope.config = angular.copy(ConfigManager.config);  // clone it
        // TODO: If there is going to be more warning banners, use a directive.
        $scope.tabs = {};
        $scope.tabs.general = {
            interval_class: "",
            less_than_5: false,
            bad_input: false,
            valid: true,
            validate: value => {
                $scope.tabs.general.interval_class = "";
                $scope.tabs.general.less_than_5 = false;
                $scope.tabs.general.bad_input = false;
                $scope.tabs.general.valid = true;
                if (isNumber(value)) {
                    if (Number(value) < 5) {
                        $scope.tabs.general.valid = false;
                        $scope.tabs.general.less_than_5 = true;
                        $scope.tabs.general.interval_class = "has-error";
                    }
                } else {
                    $scope.tabs.general.valid = false;
                    $scope.tabs.general.bad_input = true;
                    $scope.tabs.general.interval_class = "has-error";
                }
            },
            clear_history: () => {
                VideoStorage.new_history([]);
                if (VideoStorage.history_mode) {
                    VideoStorage.switch_to("history");
                    ChannelList.update_video_count();
                }
                Bridge.emit("clear-history");
            }
        };

        $scope.tabs.filter = {
            filter_active: false,
            dup_filter: false,
            filters_bad_channel_name: false,
            filters_bad_pattern: true,
            new_filter: {
                channel_title: "",
                video_title_pattern: "",
                video_title_is_regex: false,
                include_on_match: false
            },
            fill_input_form: filter =>
                angular.extend($scope.tabs.filter.new_filter, filter),
            is_dup: filter => $scope.config.filters.some(
                e => e.video_title_pattern === filter.video_title_pattern &&
                e.channel_title === filter.channel_title &&
                e.video_title_is_regex === filter.video_title_is_regex &&
                e.include_on_match === filter.include_on_match),
            add_filter: filter => {
                $scope.tabs.filter.dup_filter = false;
                filter = angular.copy(filter);
                filter.video_title_pattern = filter.video_title_pattern.trim();
                filter.channel_title = filter.channel_title.trim();
                if ($scope.tabs.filter.is_dup(filter)) {
                    $scope.tabs.filter.dup_filter = true;
                    return;
                }
                $scope.config.filters.push(filter);
            },
            get_filter_class: filter => filter.include ?
                                        "bg-success": "bg-danger",
            move_up: index => {
                if (index <= 0 || !index) {
                    return;
                }
                var below = $scope.config.filters[index - 1];
                $scope.config.filters[index - 1] = $scope.config.filters[index];
                $scope.config.filters[index] = below;
            },
            move_down: index => {
                if (index === $scope.config.filters.length - 1 ||
                    index === undefined || index < 0) {
                    return;
                }
                var above = $scope.config.filters[index + 1];
                $scope.config.filters[index + 1] = $scope.config.filters[index];
                $scope.config.filters[index] = above;
            },
            remove_filter: index => $scope.config.filters.splice(index, 1),
            include_radio_getter_setter: val => {
                if (arguments.length === 0) {
                    return $scope.tabs.filter.new_filter.
                                include_on_match ? "include" : "exclude";
                }
                $scope.tabs.filter.new_filter.include_on_match =
                    val === "include";
            }
        };

        $scope.tabs.import_export = {
            export_settings: () => Bridge.emit("export", null),
            import_settings: input => {
                $scope.tabs.import_export.import_error = false;
                Bridge.emit("import", input);
            }
        };

        function isNumber (n) {  // found on stackoverflow
            return !isNaN(parseFloat(n)) && isFinite(n);
        }

        $scope.save = function () {
            $modalInstance.close();
            ConfigManager.update_config($scope.config);
            Bridge.emit("update-config", $scope.config);
        };

        $scope.cancel = function () {
            $modalInstance.dismiss('cancel');
        };

        Bridge.on("export-result", event => {
            $scope.tabs.import_export.config_output = event.detail;
            $scope.$apply();
        }, false);

        Bridge.on("import-error", event => {
            $scope.tabs.import_export.import_error = true;
            $scope.$apply();
        }, false);
    })

    .controller("subscriptions", function ($scope, $modalInstance, ChannelList, VideoStorage, Bridge) {
        $scope.chnl = ChannelList;
        $scope.search = {
            term: "",
            result: [],
            in_progress: false,
            searched_once: false
        };
        $scope.duplicate = false;
        var clear = false;
        $scope.fit = function(body_height, result_height) {
            if (clear) {
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

        $scope.add_channel = function(channel) {
            $scope.duplicate = false;
            Bridge.emit("add-channel", channel);

            function add_listener () {
                Bridge.removeListener("channel-duplicate");
                ChannelList.channels.push(channel);
            }

            function duplicate_listener () {
                Bridge.removeListener("channel-added");
                $scope.duplicate = true;
                $scope.$apply();
            }
            Bridge.on("channel-added", add_listener);
            Bridge.on("channel-duplicate", duplicate_listener);
        };

        $scope.remove_channel = function(channel) {
            Bridge.emit("remove-channel", channel);
            ChannelList.remove_channel(channel);
            VideoStorage.remove_video_by_channel(channel.id);
            if (ChannelList.current_channel === "") {
                var masonry_container = document.querySelector("[masonry]");
                angular.element(masonry_container).scope().switch_channel("");
                return;
            }
            ChannelList.current_channel = "";
        };

        function search_result_listener (event) {
            var result = JSON.parse(event.detail);
            if (result.length === 0 || result[0] === null) {
                clear = true;
            } else {
                $scope.search.result = result;
                clear = false;
            }
            $scope.search.in_progress = false;
            $scope.$apply();
        }

        $scope.search_channel = function($event) {
            if($event.keyCode == 13) {
                $scope.search.in_progress = true;
                Bridge.emit("search-channel", $scope.search.term);
                Bridge.on("search-result", search_result_listener, false);
                $scope.search.result = [];
                $scope.search.searched_once = true;
                $scope.duplicate = false;
                clear = true;
            }
        };
    });