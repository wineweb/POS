odoo.define('mo_ukr_fiscal_recorder.gera_fiscal_kanban', function(require) {
"use strict";

var KanbanController = require('web.KanbanController');;
var session = require('web.session');
var crashmanager = require('web.ErrorDialogRegistry');
var core = require('web.core')
var _t = core._t


KanbanController.include({

    _onButtonClicked: function (ev) {
        if (this.modelName === 'pos.config'){
           if (ev.data.attrs.name === 'print_z_report' || ev.data.attrs.name === 'print_x_report' || ev.data.attrs.name === 'print_product_x_report'){
                var boxes = this.triggers;
                var ip = this.box_fiscal_ip;
                if ((ip && boxes && boxes[ip][1] != 'gera fiscal') || !boxes || !ip){
                    this._super(ev)
                    return
                }
                if (ev.data.attrs.name === 'print_z_report'){
                     this.process_gera_report(boxes, '0')
                } else if (ev.data.attrs.name === 'print_x_report'){
                     this.process_gera_report(boxes, '10')
                } else if (ev.data.attrs.name=== 'print_product_x_report'){
                     this.process_gera_report(boxes, '20')
                }
           } else {
                this._super(ev);
           }
        } else {
            this._super(ev);
        }
    },

    process_gera_report: function (boxes, report_type) {
        var self = this;
        for (var box in boxes) {
            this.call(
                'iot_longpolling',
                'action',
                box,
                boxes[box][0],
                {
                     action: boxes[box][3],
                     report_type: report_type,
                     device_id: boxes[box][0],
                     user: boxes[box][3],
                     password: boxes[box][4]
                },
                '',
                ''
            ).then(function (res) {
               if ((!res.result && res.error.message) || (!res.result && !res.error)){
                   var error =  res.error
                   if (!res.result && res.error) {
                        self.do_warn(_t("Error"), _t("An error occurred during printing receipt. " + error.data.message));
                   } else {
                        self.do_warn(_t("Error"), _t("An error occurred during printing receipt."));
                   }
               }
            });
        }
     }

});

})