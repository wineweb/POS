odoo.define('mo_ukr_fiscal_recorder.fiscal_form', function(require) {
"use strict";

var FormController = require('web.FormController');
var session = require('web.session');


FormController.include({

     renderButtons: function($node) {
            this._super.apply(this, arguments);
            if (this.$buttons) {
                let btn = this.$buttons.find('.o_fiscal_report');
                var z_report = this.$buttons.find('.z_report')
                var x_report = this.$buttons.find('.x_report')
                var product_z_report = this.$buttons.find('.x_product')
                z_report.click(this.proxy('_onReportFiscalZClicked')) ;
                x_report.click(this.proxy('_onReportFiscalXClicked')) ;
                product_z_report.click(this.proxy('_onReportFiscalXProductClicked')) ;
            }
        },

     start: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            var state = self.model.get(self.handle);
            if (state.data.box_with_fiscal) {
                self.triggers = JSON.parse(state.data.box_with_fiscal);
                self.box_fiscal_ip = state.data.box_fiscal_ip;
            }
        });
    },

    _onReportFiscalZClicked: function (ev) {
        ev.preventDefault();
    },
    _onReportFiscalXClicked: function (ev) {
        ev.preventDefault();
    },
    _onReportFiscalXProductClicked: function (ev) {
        ev.preventDefault();
    },

});

})