// -----------------------------------------------------------------------------
// Tiger.js
// 
// Mako-like template preprocessor for javascript
//
//
// Parsing
//   parsing is very dumb and is really just serial tokenization. a
//   proper parser, ast and recusive generation is probably needed
//   
// Object model for templates
//   templates will be applied to an object for execution
//   functions will insert themselves into current context
//   other objects can be mapped to scope with namespace tags
//   when called, we execute a qualified function (this:foo)
//  
// -----------------------------------------------------------------------------

var global = this;

(function() {

    var DEBUG = true;

    var text_pattern = /^((.|\n)*?)((?=\${)|(?=<\/?%)|(?=%\w+)|$)/;
    var tag_open_pattern = /^\<%([\w\.\:]+)((?:\s+\w+|\s*=\s*|".*?"|'.*?')*)\s*(\/)?>/;
    var tag_close_pattern = /^\<\/%[\t ]*(.+?)[\t ]*>/;
    var expression_pattern = /^\${([^}]*)}/;
    var name_pattern = /([a-zA-Z_]\w+)\:([a-zA-Z_]\w+)/;
    var attrs_pattern = /\s*(\w+)\s*=\s*(?:'([^']*)'|\"([^\"]*)\")/g;

    if(!global['console']) {
        global.console = {
            log: function(o) {
                System.err.println(JSON.stringify(o)); 
            }
        }
    }

    function repeat(c, n) {
        return Array(n).join(c)
    }

    function section(s) {
        var bar = repeat('-', 80 - (s.length + 1));
        if(DEBUG)
            console.log("\n" + s + ' ' + bar + "\n");
    }

    function log() {
        if(DEBUG) {           
            console.log.apply(console, arguments);
        }
    }

    function replace(fmt) {
        var params = arguments;

        function replacer(str, position, offset, s) {
            return String(params[Number(position)+1] || '');
        }

        return fmt.replace(/{(\d+)}/g, replacer);
    } 
   
    function Context(locals) {
        this.buffers = [[]];
        this.call_stack = [];
        this.locals = locals;
        this.this_ = {};
        this.namespaces = {};

        // Built-In Filters
        //
        // u - url escaping
        // h - html escaping
        // x - xml escaping
        // trim - whitespace trimming
        
        this.filters = {
            'h': function(s) { return s.replace(/&/g,'&amp;')
                                       .replace(/</g,'&lt;')
                                       .replace(/>/g,'&gt;')  },
            'u': function(s) { return escape(s) },
            'trim': function(s) { return s.replace(/^\s\s*/, '')
                                          .replace(/\s\s*$/, '') }
        }
    }

    Context.prototype.peek_buffer = function() {
        return this.buffers[this.buffers.length - 1];
    }

    Context.prototype.filter = function(name, s) {
        return this.filters[name](s);
    }

    Context.prototype.write = function(s, filters) {
        s = String(s || '').toString();
        filters = filters || [];

        for(var i=0; i<filters.length; i++)
            s = this.filter(filters[i], s);

        return this.peek_buffer().push(s.toString());
    }

    Context.prototype.get = function() {
        return this.peek_buffer().join('');
    }

    Context.prototype.push_buffer = function() {
        return this.buffers.push([]);
    }

    Context.prototype.pop_buffer = function() {
        var rv = this.get();
        this.buffers.pop();
        return rv;
    }

    // FIXME need to add function scoping stack
    Context.prototype.add_function = function(name, f) {
        this.this_[name] = f;
    }

    Context.prototype.invoke = function(func, attrs, body) {
        return func.call(this.this_, attrs, body);
    }

    Context.prototype.push_call = function(func, attrs) {
        var body = this.push_buffer();
        this.call_stack.push({'func': func, 'attrs': attrs});
    }

    Context.prototype.pop_call = function() {
        var body = this.pop_buffer();
        var call = this.call_stack.pop();
        this.invoke(call.func, call.attrs, body);
    }

    function Template(body) {
        var sandbox = "with(context.namespaces) {\nwith(context.locals) {\n{0}\n}\n}";
        var sandboxed = replace(sandbox, body);
                
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
        } catch(e) {          
            var err = e.constructor('Error in Evaled Script: ' + e.message);
            // +3 because `err` has the line number of the `eval` line plus two.
            err.lineNumber = e.lineNumber - err.lineNumber + 3;
            throw err;
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

    var match_regex_tag_open = match_regex(tag_open_pattern);
    var match_regex_expression = match_regex(expression_pattern);

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

            rv.inline = (rv[3] == '/');
        }

        return rv;        
    }

    function match_expression(s) {
        var rv = match_regex_expression(s);

        if(rv) {
            var parts = rv[1].split(/\|/);
            rv[1] = parts[0];
            if(parts[1]) 
                rv[2] = parts[1].split(/, ?/);
        }

        return rv;
    }

    var patterns = [
        {name: 'block', match: match_block},
        {name: 'expression', match: match_expression},
        {name: 'start-tag', match: match_open_tag},
        {name: 'end-tag', match: match_regex(tag_close_pattern)},
        {name: 'end-control', match: match_regex(/^%end([^\n]+)\n/)},
        {name: 'else', match: match_regex(/^%else\n/)},
        {name: 'start-control', match: match_regex(/^%([^\n]+)\n/)},
        {name: 'text', match: match_regex(text_pattern)}
    ];

    function tokenize(input) {        
        var rv = [];        
        while(input) {

            var token, pattern;
            for(var j=0; j<patterns.length; j++) {
                pattern = patterns[j];
                token = pattern.match(input)
                if(token)
                    break;
            }
            
            if(!token) {
                log('Parse error')
                log(rv);
                log(input)
                return [];
            }

            pos = token[0].length;
            rv.push({name: pattern.name, data: token});
            input = input.substring(pos);
        }

        return rv;
    }

    function clean_text(s) {
        return '"' + s.replace(/\n/g, '\\n').replace(/"/g, '\\"') + '"';
    }

    function flatten_list(l) {
        var parts  = [];
        
        for(var i=0; i<l.length; i++)
            parts.push("'" + l[i] + "'");

        return '[' + parts.join(', ') + ']';
    }

    function flatten_attrs(attrs) { 
        var params = [];

        for(var k in attrs) {
            var v = attrs[k];
            
            var match = v.match(expression_pattern);
            if(match) {
                v = match[1];
            } else {
                v = "'" + v + "'";
            }
            
            params.push(k + ': ' + v);
        }

        return '{' + params.join(', ') + '}';
    }

    function load(uri, callback) {
        
    }

    var nodes = {
        'text': function(token) {
            return replace('context.write({0});', clean_text(token.data[1]));
        },
        'expression': function(token) {
            var expr = token.data[1] || '""';
            var filters = token.data[2] || ['h'];
            return replace('context.write({0}, {1});', expr, flatten_list(filters));
        },
        'block': function(token) {
            return token.data[1];
        },
        'start-control': function(token) {
            return token.data[1] + '{';
        },
        'end-control': function(token) {
            return '}';
        },
        'else': function(token) { 
            return '} else { ';
        }, 
        'start-tag': function(token) {
            var tag_name = token.data[1];
            var i;
            var match;

            if(tag_name == 'function') {

                return replace(
                    'context.add_function( \'{0}\', function (attrs, body) {', 
                    token.data.attrs.name
                );

            } else if(tag_name == 'namespace') {

                

            } else if((match = tag_name.match(name_pattern))) {

                var name = match[1] + '.' + match[2];
                var attrs = flatten_attrs(token.data.attrs);                
                var method = token.data.inline ? 'invoke'  : 'push_call'

                return replace('context.{0}({1}, {2});', method, name, attrs);
            }
        }, 
        'end-tag': function(token) {
            var tag_name = token.data[1];
            if(tag_name == 'function') { 
                return '});'
            } else if((match = tag_name.match(name_pattern))) {
                // FIXME check balance, add some assertions
                return 'context.pop_call();';
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

        var body = fragments.join("\n    ");

        return new Template(body);
    }
    
    this.tiger = function(tmpl) {
        return compile(tokenize(tmpl));
    }
    
    if(global['$']) {
        // FIXME add jquery helpers
    }

})();