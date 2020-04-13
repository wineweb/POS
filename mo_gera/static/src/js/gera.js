odoo.define('mo_ukr_fiscal_recorder.gera_recorder', function(require) {
"use strict";

var Session = require('web.Session');
var screens = require('point_of_sale.screens');
var PrinterMixin = require('point_of_sale.Printer').PrinterMixin;
var PrinterProxy = require('pos_iot.Printer');
var models = require('point_of_sale.models');
var chrome = require('point_of_sale.chrome');
var gui = require('point_of_sale.gui');
var PopupWidget = require('point_of_sale.popups');
var iot = require('iot.widgets')
var BusService = require('bus.BusService');
var core = require('web.core')
var _t = core._t

var QWeb = core.qweb

var existing_models = models.PosModel.prototype.models;
var user_index = _.findIndex(existing_models, function (model) {
    return model.model === "res.users";
})
var user_model = existing_models[user_index];

models.load_models([{
  model:  user_model.model,
  fields: user_model.fields.concat(['gera_user_id', 'gera_user_password']),
  domain: user_model.domain,
  loaded: user_model.loaded,
}]);

//var IoTGeraLongpolling = BusService.extend(iot.IoTLongpolling, {
//    ACTION_ROUTE: '/hw_drivers/gera_action',
//})
//
//core.serviceRegistry.add('iotgera_longpolling', IoTGeraLongpolling);
//var _iotgera_longpolling = new IoTGeraLongpolling();

var GeraPopupWidget = PopupWidget.extend({
    template: 'GeraPopupWidget',
    events: _.extend({}, PopupWidget.prototype.events, {
        'click .button.close-popup':  'click_close',
    }),

    click_close: function(){
        this.gui.close_popup();
    },

});
gui.define_popup({name:'gera_popupwidget', widget: GeraPopupWidget});

screens.ReceiptScreenWidget.include({

    print_json: function () {
        if (this.pos.config.fiscal_recorder && this.pos.proxy.printer.manufacturer == 'gera fiscal'){
            var order = this.pos.get_order();
            var screen = this.pos.gui.get_current_screen();
            if (screen == 'reprint_receipt'){
                var receipt = order.export_for_printing();
                receipt['sale_lines'] = []
            } else {
                var receipt = order.get_fiscal_receipt();
            }
            this.pos.proxy.printer.print_receipt(receipt);
            if (screen == 'payment'){
                this.pos.get_order()._printed = true;
            }
        } else {
            this._super()
        }
    },

})

PrinterProxy.include({

    send_printing_job: function (img) {
        if (this.manufacturer == 'gera fiscal'){
            var message = _t('Printing receipt...');
            $.blockUI({message: QWeb.render('Throbber')});
            self.$(".oe_throbber_message").html(message);
            return this.action({
                 action: 'print_receipt',
                 receipt: img,
                 device_id: this._identifier,
                 user: this.pos.user.gera_user_id,
                 password: this.pos.user.gera_user_password == undefined ? '0': this.pos.user.gera_user_password
            })
        }
        return this.action({
            action: 'print_receipt',
            receipt: img,
        });

    },

    send_printing_job_report_gera: function (report_type) {
        if (this.manufacturer == 'gera fiscal'){
            return this.action({
                 action: 'print_report',
                 report_type: report_type,
                 device_id: this._identifier,
                 user: this.pos.user.gera_user_id,
                 password: this.pos.user.gera_user_password == undefined ? '0': this.pos.user.gera_user_password
            })
        }
    },

    _onIoTActionResult: function (data){
        this._super(data);
        if (this.pos && this.manufacturer == 'gera fiscal'){
            if (data.result != true) {
                if (data.result != undefined) {
                    this.pos.gui.show_popup('error',{
                        'title': _t('The fiscal receipt error'),
                        'body':  _t('Can not print receipt:') + ' ' + data.result,
                    });
                } else {
                    this.pos.gui.show_popup('error',{
                        'title': _t('The fiscal receipt error'),
                        'body':  _t('Can not print receipt:') + ' ' + data.error.message + '. ' + data.error.data.message,
                    });
                }
                var screen = this.pos.gui.get_current_screen();
                if (screen == 'payment') {
                    var order = this.pos.get_order();
                    this.pos.gui.invoicing = false;
                    order.finalized = false
                }
            } else if (data.result === true){
                var screen = this.pos.gui.get_current_screen();
                if (screen == 'payment') {
                    var order = this.pos.get_order();
                    order._printed = true;
                    this.pos.gui.current_screen.finalize_validation()
                }
            }
            $.unblockUI();
            self.$(".oe_throbber_message").html('');
        }
    },

    _onIoTActionFail: function () {
        this._super()
        if (this.pos && this.manufacturer == 'gera fiscal') {
            var order = this.pos.get_order();
            order._send_prn_err = true
            $.unblockUI();
            self.$(".oe_throbber_message").html('');
        }
    },

})

screens.PaymentScreenWidget.include({

/**
    We need to override this method because fiscal receipt should print
    on 'validate' button to avoid order validation if printer throws error
 */
    validate_order: function(force_validation) {
        if (this.pos.proxy.printer && this.pos.config.fiscal_recorder && this.pos.proxy.printer.manufacturer == 'gera fiscal'){
             var order = this.pos.get_order();
             var self = this
             if (this.order_is_valid(force_validation) && order._send_prn_err){
                this.gui.show_popup('gera_popupwidget',{
                   'title': _t('Receipt Printed?'),
                   'body': _t("Check if receipt printed press 'Validate' button."),
                   confirm: function() {
                       order._send_prn_err = false;
                       order._printed = true;
                       self.finalize_validation();
                   },
                   cancel: function() {
                       order._send_prn_err = false;
                       self.validate_order();
                   },
                });
             } else {
                this._super(force_validation);
             }
        } else {
           this._super(force_validation);
        }
    },

    click_back: function(){
        this._super();
        if (this.pos.proxy.printer && this.pos.config.fiscal_recorder && this.pos.proxy.printer.manufacturer == 'gera fiscal'){
             var order = this.pos.get_order();
             if (order._send_prn_err){
                order._send_prn_err = false;
             }
        }
    },

})

chrome.SaleDetailsButton.include({

    print_sale_details: function () {
        var self = this;
        if (self.pos.proxy.printer && self.pos.config.fiscal_recorder && self.pos.proxy.printer.manufacturer == 'gera fiscal'){
             this.pos.proxy.printer.send_printing_job_report_gera('20')
                .then(self.pos.proxy.printer._onIoTActionResult.bind(self.pos.proxy.printer))
                .guardedCatch(self.pos.proxy.printer._onIoTActionFail.bind(self.pos.proxy.printer));
        } else {
            this._super()
        }
    }

})

})