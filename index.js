$(document).ready(function() {

    $('#data').val(JSON.stringify(Data.demo, null, 2));

    $('#go').click(function() {
        
        var template = $('#template').val();
        var data = eval('x=' + $('#data').val());

        var tmpl = tiger(template);
        if(tmpl) {        
          $('#output').html(tmpl.render(data));
        }

        return false;
    }).click();
});

