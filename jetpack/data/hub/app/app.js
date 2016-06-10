/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
/* global angular, Masonry */
angular.module("subscription_checker", ["ngAnimate", "ui.bootstrap"])
    .config(function ($httpProvider) {
        /*
        This Angular app does not, and should not send out any network
        reqeusts. However, XHRs are sent out to fetch Angular templates on
        disk. When responseType is the default (""), Firefox tries to parse the
        response as XML. This of course failes as HTML is not valid XML, and
        XML parsers are very strict. The parse failure manifests as error
        messages in Firefox's console.

        Turns out, these errors do not effect any funcionality of the app.
        However since errors are scary, the following will set the responseType
        as "text" for every XHR fired by the app, avoiding XML parsing and
        error messages being logged.
        */
        $httpProvider.interceptors.push(function() {
          return {
           request: function(config) {
                config.responseType = "text";
                return config;
            }
          };
        });
    })

    .run(function(ConfigManager, Bridge) {
        Bridge.on("config", function(event) {
            var config_and_filters = JSON.parse(event.detail);
            var new_config = config_and_filters.config;
            new_config.filters = config_and_filters.filters;
            ConfigManager.update_config(new_config);
        });
    })

    .run(function(Bridge, $uibModal) {
        Bridge.on("fail-state", function (event) {
            let error_name = event.detail;
            let modal_options = {
                templateUrl: `partials/error-screens/${error_name}.html`,
                backdrop: "static",
                keyboard: false
            };
            if (error_name === "open-db-error") {
                modal_options.controller = error_name;
            }
            $uibModal.open(modal_options);
        });
    })

    .directive("videoCanvas", function() {
        return {
            templateUrl: "partials/videos.html"
        };
    })

    .directive("masonry", function($timeout, ChannelList, ConfigManager, VideoStorage) {
        return {
            restrict: "AC",
            link: link
        };

        function link (scope, elem, attrs) {
            scope.items = [];
            var container = elem[0];
            var options = angular.extend({
                itemSelector: ".item"
            }, JSON.parse(attrs.masonry));

            scope.create_instance = function (enable_transition) {
                if (scope.obj) {
                    scope.obj.destroy();
                }
                options.transitionDuration = 0;
                if (enable_transition) {
                    options.transitionDuration = "0.4s";
                }
                scope.obj = new Masonry(container, options);
            };
            if (ConfigManager.config.animations === undefined) {
                // Only set this if the single from add-on is not here yet
                // yay single threaded JavaScript
                ConfigManager.config.animations = true;
            }
            scope.create_instance(true);

            function collect_garbage () {
                var garbage = scope.obj.getItemElements().
                filter(function(v) {
                    return v.$$NG_REMOVED;
                });
                try {
                    // this might fail when the element is already removed from the dom
                    scope.obj.remove(garbage);
                } catch(_) {
                    scope.obj.reloadItems();
                }
                garbage.forEach((e)=>{angular.element(e).remove();});
                scope.obj.layout();
            }

            function v_eq (a, b) {
                return a.video_id === b.video_id;
            }

            // wrapper for native indexOf, return -1 when `element` is falsey
            function indexOf (element, array) {
                return element ? array.indexOf(element) : -1;
            }

            function history_update (new_list) {
                VideoStorage.current_view = new_list;
                $timeout(() => {
                    scope.obj.reloadItems();
                    scope.obj.layout();
                });
            }

            function crude_update (new_list) {
                var current_view = VideoStorage.current_view;
                var intersection_start = indexOf(current_view[0], new_list);
                if (intersection_start !== -1) {
                    var intersection_end = intersection_start + current_view.length - 1;
                    current_view.push(...new_list.slice(intersection_end + 1));
                    current_view.unshift(
                        ...new_list.slice(0, intersection_start));
                } else {
                    VideoStorage.current_view = new_list;
                }
                $timeout(() => {
                    var garbage = scope.obj.getItemElements().filter(function(v) {
                        return v.$$NG_REMOVED;
                    });
                    for (var e of garbage) {
                        angular.element(e).remove();
                    }
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
                    if (!e.$$NG_REMOVED) {
                        var clone = angular.element(e).clone();
                        clone.on("animationend", () => clone.remove());
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
                if (video.channel_id === new_ch || new_ch === "") {
                    delete video.$$hashKey;
                    return true;
                }
                return false;
            }

            function normal_filter (new_ch, video) {
                return video.channel_id === new_ch || new_ch === "";
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
                var current_view = VideoStorage.current_view;
                if (new_list.length > current_view.length) {
                    f = current_view[0];
                    intersection_start = indexOf(f, new_list);
                    if (intersection_start != -1) {
                        // if there is one video from the channel is present,
                        // then the rest of it is as well.
                        intersection_end = intersection_start + current_view.length - 1;
                        var before = new_list.slice(0, intersection_start);
                        var after = new_list.slice(intersection_end + 1);
                        current_view.unshift(...before);
                        current_view.push(...after);
                        collect_garbage();
                        $timeout(()=>{
                            var arr = [].slice.call(elem.children());
                            scope.obj.prepended(arr.slice(0, intersection_start));
                            scope.obj.appended(arr.slice(intersection_end + 1));
                            scope.obj.layout();
                        });
                    } else {
                        return crude_update(new_list);
                    }
                } else if (new_list.length < current_view.length) {
                    f = new_list[0];
                    intersection_start = indexOf(f, current_view);
                    if (intersection_start != -1) {
                        l = new_list[new_list.length - 1];
                        intersection_end = indexOf(l, current_view);
                        var delta = current_view.length - 1 - intersection_end;
                        // this tests if the intersection is complete.
                        if (!v_eq(current_view
                            [intersection_start + (new_list.length - 1)], l)) {
                            // a block was removed from the middle
                            var intersecting = true;
                            var i = 0;
                            // walk through the list until intersection ends
                            while (intersecting) {
                                i++;
                                intersecting = v_eq(new_list[i],
                                    current_view[intersection_start + i]);
                            }
                            var size_diff = current_view.length - new_list.length;
                            play_leave_animation(null, i + intersection_start, size_diff);
                            current_view.splice(
                                i + intersection_start, size_diff);
                        } else {
                            // remove from front and/or back
                            play_leave_animation(intersection_start, intersection_end);
                            current_view.splice(-delta, delta);
                            current_view.splice(0, intersection_start);
                        }
                        $timeout(()=>{
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
    })

    .directive("selectIndex", function ($parse) {
        return {
            link(scope, elem, attrs) {
                const { assign } = $parse(attrs.selectIndex);
                scope.$watch(function() {
                    return elem[0].selectedIndex;
                }, function(newVal) {
                    assign(scope, newVal);
                });
            }
        };
    })

    .directive("masonryTile", function() {
        return {
            restrict: "AC",
            link: function(_, elem) {
                elem.css("opacity", 0);
                elem.ready(function() {
                    elem.css("opacity", 1);
                });
            }
        };
    })

    .factory("refresh_masonry", function($timeout) {
        return () => {
            var masonry_container = document.querySelector("[masonry]");
            var masonry = Masonry.data(masonry_container);
            $timeout(function() {
                try{
                    masonry.remove(masonry.getItemElements());
                    masonry.layout();
                    masonry.prepended(masonry_container.children);
                } catch(err) {
                    masonry.reloadItems();
                    masonry.layout();
                }
            });
        };
    })

    /*
      Responsible for communication with the add-on. This factory guarantees
      that only one listener is register for any given event name at a time
    */
    .factory("Bridge", function($rootScope) {
        var registered = {};
        function on (name, listener) {
            function wrapper (event) {
                listener(event);
                $rootScope.$apply();
            }
            listen(name, wrapper);
        }

        function emit (name, data) {
            document.documentElement.
                dispatchEvent(new CustomEvent(name, {detail: data}));
        }

        function once (name, listener) {
            function wrapper (event) {
                listener(event);
                document.documentElement
                    .removeEventListener(name, wrapper, false);
                registered[name] = null;
                $rootScope.$apply();
            }
            listen(name, wrapper);
        }

        function removeListener (name) {
            document.documentElement.
                removeEventListener(name, registered[name], false);
            registered[name] = null;
        }

        function listen(name, listener) {
            document.documentElement.
                removeEventListener(name, registered[name], false);
            document.documentElement.addEventListener(name, listener, false);
            registered[name] = listener;
        }

        return {
            on,
            once,
            emit,
            removeListener,
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
                if (elem.video_id === id) {
                    video = elem;
                    return true;
                }
                return false;
            });
            return video;
        }

        this.remove_from_view = function(video) {
            for (var i = parent.current_view.length - 1; i >= 0; i--) {
                if (parent.current_view[i].video_id === video.video_id) {
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
            video.duration = duration;
            // update the video in current view
            video = get_video_by_id(id, parent.current_view);
            video.duration = duration;
        };

        function add_history (video) {
            history.unshift(video);
            if (history.length > 50) {
                history.pop();
            }
        }

        this.remove_video = function(video) {
            for (var i = parent.videos.length - 1; i >= 0; i--) {
                if (parent.videos[i].video_id === video.video_id) {
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
                if (parent.videos[i].channel_id === channel_id) {
                    parent.videos.splice(i, 1);
                }
            }
        };

        this.toggle_history = function() {
            parent.history_mode = !parent.history_mode;
            var target = parent.history_mode ? "history" : "main";
            parent.switch_to(target);
        };

        this.total_video_count = () => parent.videos.length > 0 ?
                                            parent.videos.length : "";
    })

    .service("ConfigManager", function($animate) {
        this.config = {};
        var parent = this;
        this.update_config = function(new_config) {
            // call $animate.enabled
            // remake masonry instance
            $animate.enabled(new_config.animations);
            if (new_config.animations != parent.config.animations) {
                angular.element(document.querySelector("[masonry]")).
                    scope().create_instance(new_config.animations);
            }
            parent.config = new_config;
        };

        this.remove_filter = name => {
            if (name === "") {
                return;
            }
            for (var i = parent.config.filters.length - 1; i >= 0; i--) {
                if (parent.config.filters[i].channel_title === name) {
                    parent.config.filters.splice(i, 1);
                }
            }
        };

    })

    .service("ChannelList", function($rootScope, VideoStorage) {
        this.channels = [];
        this.current_channel = "";
        var map = new Map();

        var parent = this;

        const get_channel_by_id = Map.prototype.get.bind(map);
        this.get_channel_by_id = get_channel_by_id;

        this.update_video_count = function() {
            for (var c of parent.channels) {
                c.video_count = 0;
            }
            for (var v of VideoStorage.videos) {
                var channel = get_channel_by_id(v.channel_id);
                if (channel) {
                    channel.video_count++;
                }
            }
        };

        this.update_channels = function(new_list) {
            // This method will merge the current list with another one
            // returns whether the new_list is empty
            for (var element of new_list) {
                var matching = get_channel_by_id(element.id);
                if (matching) {
                    matching.video_count = element.video_count;
                } else {
                    parent.channels.push(element);
                    map.set(element.id, element);
                }
            }

            this.update_video_count();

            $rootScope.$apply();
            return new_list.length === 0;
        };

        this.decrease_video_count = function(channel_id) {
            parent.channels.some(function (element) {
                if (element.id === channel_id) {
                    element.video_count = Math.max(element.video_count - 1, 0);
                    return true;
                }
                return false;
            });
        };

        this.remove_channel = function(channel) {
            parent.channels.splice(parent.channels.indexOf(channel), 1);
            map.delete(channel.id);
        };

        this.has_channel = Map.prototype.has.bind(map);
    })

    .controller("frame", function($scope, $uibModal, $timeout, refresh_masonry, ChannelList, VideoStorage, ConfigManager, Bridge) {
        $scope.chnl = ChannelList;
        $scope.vs = VideoStorage;

        var setting_modal_opened = false;
        function set_close () {
            setting_modal_opened = false;
        }
        $scope.open_settings = function() {
            if (setting_modal_opened) {
                return;  // don"t open multiple
            }
            setting_modal_opened = true;
            $uibModal.open({
                templateUrl: "partials/settings.html",
                controller: "settings",
                backdrop: "static",
                keyboard: false
            }).result.then(set_close, set_close);
        };

        $scope.open_subscriptions = function() {
            $uibModal.open({
                templateUrl: "partials/subscriptions.html",
                controller: "subscriptions",
                windowClass: "subscription-modal-window"
            });
        };

        $scope.switch_channel = function(channel_id) {
            ChannelList.current_channel = channel_id;
        };

        $scope.toggle_history = function() {
            VideoStorage.toggle_history();
            angular.element(document.querySelector("[masonry]")).
                    scope().create_instance(
                        VideoStorage.history_mode ?
                        false : ConfigManager.config.animations);
            ChannelList.current_channel = "";
            ChannelList.update_video_count();
            refresh_masonry();
        };

        Bridge.on("open-settings", () => $scope.open_settings());
        let show_changelog, migration_failed;
        Bridge.on("open-changelog", () => show_changelog = true);
        Bridge.on("migration-failed", () => migration_failed = true);
        Bridge.on("subscribed-channels", event => {
            if (ChannelList.update_channels(JSON.parse(event.detail))) {
                $scope.open_subscriptions();
            }
            if (show_changelog) {
                $uibModal.open({templateUrl: "partials/changelog.html"});
            }
            if (migration_failed) {
                $uibModal.open({
                    templateUrl: "partials/error-screens/migration-failed.html"
                });
            }
        });
    })

    .controller("videos", function($scope, $timeout, refresh_masonry, VideoStorage, ChannelList, Bridge) {
        $scope.v = VideoStorage;
        // state to keep the no video message hidden until the first playload
        $scope.first_payload = false;

        $scope.channel_title = ({channel_id}) => {
            let channel = ChannelList.get_channel_by_id(channel_id);
            return channel ? channel.title : "";
        };

        $scope.open_video = function(video, event) {
            event.preventDefault();
            event.stopPropagation();
            if (VideoStorage.history_mode) {
                return Bridge.emit("open-video", video.video_id);
            }
            if (VideoStorage.remove_video(video)) {
                var event_name = event.ctrlKey || event.metaKey ? "skip-video" : "remove-video";
                Bridge.emit(event_name, video.video_id);
                var masonry_container = document.querySelector("[masonry]");
                var masonry = Masonry.data(masonry_container);
                var video_div = event.target;
                while (video_div && !video_div.classList.contains("video")) {
                    video_div = video_div.parentElement;
                }
                $timeout(()=>{
                    masonry.remove(video_div);
                    masonry.layout();
                });
                ChannelList.decrease_video_count(video.channel_id);
            }
        };


        Bridge.on("videos", event => {
            var details = JSON.parse(event.detail);
            VideoStorage.new_main(details[0]);
            VideoStorage.new_history(details[1]);
            VideoStorage.switch_to("main");
            ChannelList.current_channel = "";
            ChannelList.update_video_count();
            refresh_masonry();
            $scope.first_payload = true;
        });

        Bridge.on("duration-update", event => {
            var detail = JSON.parse(event.detail);
            VideoStorage.update_duration(detail.id, detail.duration);
        });
    })

    .filter("escape", function () {
        return function (text) {
            var dummy = document.createElement("div");
            dummy.textContent = text;
            return dummy.innerHTML;
        };
    })

    .controller("settings", function ($scope, $uibModalInstance, $uibModal, ConfigManager, ChannelList, VideoStorage, Bridge) {
        $scope.channels = ChannelList;
        $scope.config = angular.copy(ConfigManager.config);
        $scope.config.filters.forEach(e => e.inspect_tags = e.inspect_tags || false);
        // TODO: If there is going to be more warning banners, use a directive.
        $scope.tabs = {};
        $scope.tabs.general = {
            interval_class: "",
            less_than_5: false,
            bad_input: false,
            valid: true,
            validate(value) {
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
            clear_history() {
                VideoStorage.new_history([]);
                if (VideoStorage.history_mode) {
                    VideoStorage.switch_to("history");
                    ChannelList.update_video_count();
                }
                Bridge.emit("clear-history");
            },
            changelog: () => $uibModal.open({ templateUrl: "partials/changelog.html" })
        };

        $scope.tabs.filter = {
            filter_active: false,
            dup_filter: false,
            filters_bad_channel_name: false,
            filters_bad_pattern: true,
            new_filter: (function () {
                let filter = {
                    channel_id: "",
                    channel_title: "",
                    video_title_pattern: "",
                    video_title_is_regex: false,
                    inspect_tags: false,
                    include_on_match: false,
                };
                let new_filter_channel;
                Object.defineProperty(filter, "channel", {
                    get() {
                        return new_filter_channel ? new_filter_channel.title
                                                  : filter.channel_title;
                    },
                    set(newVal) {
                        new_filter_channel = newVal;
                        filter.channel_title = newVal && newVal.title;
                        filter.channel_id = newVal && newVal.id;
                    }
                });
                return filter;
            })(),
            fill_input_form(filter) {
                filter.inspect_tags = filter.inspect_tags || false;
                let { new_filter } = $scope.tabs.filter;
                Object.assign(new_filter, filter);
                new_filter.channel = ChannelList.get_channel_by_id(filter.channel_id);
            },
            is_dup: filter => $scope.config.filters.some(e =>
                e.video_title_pattern === filter.video_title_pattern &&
                e.channel_title === filter.channel_title &&
                e.video_title_is_regex === filter.video_title_is_regex &&
                e.include_on_match === filter.include_on_match),
            add_filter: filter => {
                $scope.tabs.filter.dup_filter = false;
                filter = angular.copy(filter);
                filter.video_title_pattern = filter.video_title_pattern.trim();
                if ($scope.tabs.filter.is_dup(filter)) {
                    $scope.tabs.filter.dup_filter = true;
                    return;
                }
                $scope.config.filters.push(filter);
            },
            get_filter_class: filter => filter.include ? "bg-success": "bg-danger",
            remove_filter(index) {
                if (index >= 0) {
                    $scope.config.filters.splice(index, 1);
                }
            },
            include_radio_getter_setter(val) {
                if (arguments.length === 0) {
                    return $scope.tabs.filter.new_filter.include_on_match ?
                        "include" : "exclude";
                }
                $scope.tabs.filter.new_filter.include_on_match = val === "include";
            }
        };

        $scope.tabs.import_export = {
            import_success: "",
            import_error: "",
            export_settings: () => Bridge.emit("export", null),
            import_settings: input => {
                $scope.tabs.import_export.import_error = false;
                $scope.tabs.import_export.import_success = false;
                Bridge.emit("import", input);
            }
        };

        $scope.tabs.logs = {
            dump_failed: false,
            clear_success: false,
            request_logs() {
                Bridge.emit("get-error-logs");
                Bridge.once("error-logs", ev => {
                    Bridge.removeListener("dump-logs-failed");
                    var a = document.createElement("a");
                    a.download = "logs.json";
                    a.href = URL.createObjectURL(new Blob([ev.detail], {type : "application/json"}));
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(a.href));
                });
                Bridge.once("dump-logs-failed", () => {
                    Bridge.removeListener("error-logs");
                    $scope.tabs.logs.dump_failed = true;
                });
            },
            clear_logs() {
                if (window.confirm("Are you sure?")) {
                    Bridge.emit("clear-logs");
                    $scope.tabs.logs.clear_success = true;
                }
            }
        };

        function isNumber (n) {  // found on stackoverflow
            return !isNaN(parseFloat(n)) && isFinite(n);
        }

        $scope.save = function () {
            $uibModalInstance.close();
            ConfigManager.update_config($scope.config);
            Bridge.emit("update-config", $scope.config);
        };

        $scope.cancel = function() {
            if (!angular.equals($scope.config, ConfigManager.config) &&
                !window.confirm("You have unsaved settings. Are you sure?")) {
                return;
            }
            $uibModalInstance.close();
        };

        Bridge.on("export-result", event =>
            $scope.tabs.import_export.config_output = event.detail);

        Bridge.on("import-error", () =>
            $scope.tabs.import_export.import_error = true);

        Bridge.on("import-success", () => {
            $scope.config = angular.copy(ConfigManager.config);  // new configs
            $scope.tabs.import_export.import_success = true;
        });
    })

    .controller("subscriptions", function ($scope, $uibModalInstance, ChannelList, VideoStorage, Bridge, ConfigManager) {
        $scope.chnl = ChannelList;
        $scope.search = {
            term: "",
            result: [],
            in_progress: false,
            searched_once: false
        };
        $scope.duplicate = false;

        $scope.save = function () {
            $uibModalInstance.close();
        };

        $scope.cancel = function () {
            $uibModalInstance.dismiss("cancel");
        };

        $scope.add_channel = function(channel) {
            $scope.duplicate = false;
            Bridge.emit("add-channel", channel);

            Bridge.once("channel-added", () => {
                ChannelList.update_channels([channel]);
                Bridge.removeListener("channel-duplicate");
            });
            Bridge.once("channel-duplicate", () => {
                $scope.duplicate = true;
                Bridge.removeListener("channel-added");
            });
        };

        $scope.remove_channel = function(channel) {
            Bridge.emit("remove-channel", channel);
            ChannelList.remove_channel(channel);
            VideoStorage.remove_video_by_channel(channel.id);
            ConfigManager.remove_filter(channel.title);
            if (ChannelList.current_channel === "") {
                var masonry_container = document.querySelector("[masonry]");
                angular.element(masonry_container).scope().switch_channel("");
                return;
            }
            ChannelList.current_channel = "";
        };

        function search_result_listener (event) {
            var result = JSON.parse(event.detail);
            if (result.length > 0 && result[0]) {
                $scope.search.result = result;
            }
            $scope.search.in_progress = false;
            $scope.$apply();
        }

        $scope.search_channel = function($event) {
            if($event.keyCode === 13) {
                $scope.search.in_progress = true;
                Bridge.emit("search-channel", $scope.search.term);
                Bridge.on("search-result", search_result_listener);
                $scope.search.result = [];
                $scope.search.searched_once = true;
                $scope.duplicate = false;
            }
        };
    })

    .controller("open-db-error", function ($scope, Bridge) {
        $scope.drop_db = () => {
            $scope.deleting = true;
            Bridge.emit("drop-db");
            Bridge.once("drop-db-success", () => {
                window.alert("Database deleted. Sorry about the inconvenience");
                window.location.reload();
            });
            Bridge.once("drop-db-error", () => {
                window.alert("Failed to delete the database. This is really bad. You should contact the developer");
            });
        };
    });
