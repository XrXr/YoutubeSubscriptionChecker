These are older version used to test migraions manually. `run-with-xpi` is like
`jpm run` but with an xpi.

```
./run-with-xpi <xpi>
./run-with-xpi -b <path-to-firefox> <xpi>
```

Also works if ran with `node run-with-xpi`. Make sure to `npm install selenium-webdriver`
before using it.