#!/usr/bin/env rhino

importPackage(java.io);
importPackage(java.lang);

load('tiger.js');
 
function slurp(f) {
    var reader = new BufferedReader(new InputStreamReader(f));

    var rv = [];

    var i;
    while((i = reader.readLine()))
        rv.push(i);

    return rv.join("\n");
}

for(var i=0; i<arguments.length; i++)
    load(arguments[i]);

var template = tiger(slurp(System['in']));
print(template.render(Data.demo));