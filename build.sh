#!/bin/sh

COMPILE=0

if [ $COMPILE ]
then
    java -jar ~/compiler.jar  --js tiger.js > tiger.min.js
fi

rhino build.js json2.js data.js < index.tiger > index.html
