// -----------------------------------------------------------------------------
// Tiger.js
// 
// Mako-like template preprocessor for javascript
//
//
// FIXME switch to jison for parsing
//
// Object model for templates
//   templates will be applied to an object for execution
//   functions will insert themselves into current context
//   other objects can be mapped to scope with namespace tags
//   when called, we execute a qualified function (this:foo)
//  
// -----------------------------------------------------------------------------


function repeat(c, n) {
    return Array(n).join(c)
}

function section(s) {
    var bar = repeat('-', 80 - (s.length + 1));
    console.log("\n" + s + ' ' + bar + "\n");
}

function log() {
    console.log.apply(console, arguments);
}

(function() {
   
    function Context(locals) {
        this.buffer = [];
        this.locals = locals;
        this.this_ = {};
        this.namespaces = {};
    }

    Context.prototype.write = function(s) {
        this.buffer.push(s || '');
    }    

    Context.prototype.add_function = function(name, f) {
        this.this_[name] = f;
    }

    Context.prototype.get = function() {
        return this.buffer.join('');
    }

    function Template(body) {
        var sandbox = "with(context.namespaces) {\nwith(context.locals) {\n$body\n}\n}";
        var sandboxed = sandbox.replace('$body', body);
                
        section("Sandboxed ");
        log(sandboxed)

        try {
            this.impl = new Function('context', sandboxed)
        } catch(err) {
            section("Compilation Error  ");
            log(err);
        }
    }

    Template.prototype.render = function(locals) {
        context = new Context(locals);

        section("Rendering");
        try {
            this.impl.call(context.this_, context);
        } catch(err) {
            section("Error");
            log(err);
        }

        return context.get();
    }
    
    function match_regex(pattern) {
        return function(s) {
            var rv = s.match(pattern);
            if(rv)
                delete rv['input'];

            return rv;
        }
    }

    function match_block(s) {
        var rv = null;
        if(s.match(/^<%/)) {

            close = s.match(/%>/)
            if(close) {
                rv = {0: s.substring(0, close.index + 2),
                      1: s.substring(2, close.index)};               
            }
        }

        return rv;
    }

    var tag_open_pattern = /^\<%([\w\.\:]+)((?:\s+\w+|\s*=\s*|".*?"|'.*?')*)\s*(\/)?>/;
    var tag_close_pattern = /^\<\/%[\t ]*(.+?)[\t ]*>/;
    var variable_pattern = /^\${([^}]*)}/;
    var attrs_pattern = /\s*(\w+)\s*=\s*(?:'([^']*)'|\"([^\"]*)\")/g;
    var match_regex_tag_open = match_regex(tag_open_pattern);

    function match_open_tag(s) {
        var rv = match_regex_tag_open(s);
        if(rv) {
            rv.attrs = {};
            // FIXME this seems hacky
            var i;
            while((i = attrs_pattern.exec(rv[2]))) {
                var k = i[1];
                var v = i[3];
                rv.attrs[k] = v;
            }
        }

        return rv;        
    }

    var patterns = [
        {name: 'block', match: match_block},
        {name: 'variable', match: match_regex(variable_pattern)},
        {name: 'start-tag', match: match_open_tag},
        {name: 'end-tag', match: match_regex(tag_close_pattern)},
        {name: 'end-control', match: match_regex(/^%end([^\n]+)\n/)},
        {name: 'else', match: match_regex(/^%else\n/)},
        {name: 'start-control', match: match_regex(/^%([^\n]+)\n/)}
    ];

    function consume(consumed) {
        return {name: 'text', data: clean_text(consumed.join(''))};
    } 

    function tokenize(input) {        
        var rv = [];        
        var consumed = [];
        
        while(input) {

            var token, pattern;
            for(var j=0; j<patterns.length; j++) {
                pattern = patterns[j];
                token = pattern.match(input)
                if(token)
                    break;
            }
            
            var pos;
            if(token) {
                pos = token[0].length;

                if(consumed.length>0)
                    rv.push(consume(consumed));

                consumed = [];

                rv.push({name: pattern.name, data: token});
            } else {
                consumed.push(input[0]);
                pos = 1;
            }

            input = input.substring(pos);
        }

        if(consumed.length>0)
            rv.push(consume(consumed));

        return rv;
    }

    function clean_text(s) {
        return s.replace(/\n/g, '\\n').replace(/"/g, '\\"');
    }

    function flatten_attrs(attrs) { 
        params = [];

        for(var k in attrs) {
            var v = attrs[k];
            
            var match = v.match(variable_pattern);
            if(match) {
                v = match[1];
            } else {
                v = "'" + v + "'";
            }
            
            params.push(k + ': ' + v);
        }

        return '{' + params.join(', ') + '}';
    }

    var nodes = {
        'text': function(token) { 
            return  'context.write(\"' + token.data + '");' 
        },
        'variable': function(token) {
            return 'context.write(' + token.data[1] + ');' 
        },
        'block': function(token) {
            return token.data[1];
        },
        'start-control': function(token) {
            return token.data[1] + '{' 
        },
        'end-control': function(token) {
            return '}' 
        },
        'else': function(token) { 
            return '} else { ' 
        }, 
        'start-tag': function(token) {
            var tag_name = token.data[1];
            var i;
            var match;

            if(tag_name == 'function') {
                return 'context.add_function( \'' + token.data.attrs.name + '\', function () {'
            } else if((match = tag_name.match(/([a-zA-Z_]\w+)\:([a-zA-Z_]\w+)/))) {
                // FIXME object scoping rules

                var namespace = match[1];
                var method = match[2];
                name = namespace + '.' + method;
                var arg = flatten_attrs(token.data.attrs);
                return 'console.log(this); ' + name + '(' + arg + ');';
            }
        }, 
        'end-tag': function(token) {
            var tag_name = token.data[1];
            if(tag_name == 'function') { 
                return '});'
            }             
        }
    }

    function compile(tokens) {

        section("Compile");
        log(tokens);

        var fragments = [];

        for(var i=0; i<tokens.length; i++) {
            var token = tokens[i];
            var fragment = nodes[token.name](token);
            fragments.push(fragment);
        }

        var body = fragments.join("\n");

        return new Template(body);
    }
    
    this.tiger = function(tmpl) {
        return compile(tokenize(tmpl));
    }
    
})();

var test = 
    "x is <stong>${x}</strong>\n"                 +
    "%if(x%2 == 0)\n"                             +
    "x is even"                                   +
    "%else\n"                                     +
    "x is odd"                                    +
    "%endif\n"                                    +
    "<%\n"                                        +
    "  console.log('!!! in a block');\n"          +
    "  console.log(context);\n"                   +
    "  function bar() { return 'bar!!!'; }\n"     +
    "%>\n"                                        +
    "<%function name=\"foo\">"                    +
    "!!! in foo"                                  +
    "${console.log(arguments)}"                   +
    "</%function>"                                +
    "%for(var i=0; i<people.length; i++)\n"       +
    "<tr class=\"${ (i%2) ? 'odd' : 'even'}\">\n" +
    "  <td>${people[i].first}</td>\n"             +
    "  <td>${people[i].last}</td>\n"              +
    "  <td>${people[i].email}</td>\n"             +
    "</tr>\n"                                     +
    "%endfor\n"                                   +
    "${bar(1,2,3,'blah')}\n"                      +
    "------------------------------\n"            +
    "<%this:foo bar=\"1\" qux=\"${context}\"/>";

section("Source");
log(test);

var data = {
    x: 123, 

    people: [
        {first: 'John', last: 'Doe', email: 'john.doe@example.com'},
        {first: 'Jane', last: 'Doe', email: 'jane.doe@example.com'},
        {first: 'Alice', last: 'Smith', email: 'asmith@example.com'},
        {first: 'Bob', last: 'Jones', email: 'bjsones@example.com'}
    ]
};

section("Data");
log(data);

var tmpl = tiger(test);
var text = tmpl.render(data);

section("Output");
log(text);

