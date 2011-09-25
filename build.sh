#!/bin/sh
java -jar ~/compiler.jar --js tiger.js > tiger.min.js
rhino build.js data.js < index.tiger > index.html
