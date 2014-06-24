A Firefox add-on that checks for new uploads from Youtube channels.

__Licensed under MPL2__

## Modified AngularJS

The AngularJS included in this add-on is slightly modified.
```js
    {cache: $templateCache}
```
become
```js
    {cache: $templateCache, responseType: "text"}
```
to squelch a error message Firefox log due to fetching templates from `file:///`