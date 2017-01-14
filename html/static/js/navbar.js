(function($) {
    $(function() {
        let step = url('?step');
        if (!step) {
            step = '1';
        }
        $('[step=' + step + ']').addClass('active');
    });
})(jQuery);
