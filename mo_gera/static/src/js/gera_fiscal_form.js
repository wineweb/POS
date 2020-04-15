odoo.define('mo_ukr_fiscal_recorder.gera_fiscal_form', function(require) {
"use strict";

var FormController = require('web.FormController');
var session = require('web.session');
var rpc = require('web.rpc');
var core = require('web.core')
var _t = core._t


FormController.include({

    _onButtonClicked: function (ev) {
        if (this.modelName === 'cash.box.out' && this.model.get(this.handle).context.active_model === 'pos.session'){
           var self = this;
           var _super = this._super.bind(this);
           if (ev.data.attrs.name === 'run'){
                this._rpc({
                        model: this.model.get(this.handle).context.active_model,
                        method: 'get_iot_info',
                        args: [this.model.get(this.handle).context.active_id]
                }).then(function (r) {
                    if (r.box_with_fiscal) {
                        var boxes = JSON.parse(r.box_with_fiscal);
                        var ip = r.box_fiscal_ip;
                        if ((ip && boxes && boxes[ip][1] != 'gera fiscal') || !boxes || !ip){
                            self._super(ev)
                            return
                        }
                        var comment = false;
                        if (r.box_with_fiscal_comment){
                            comment = self.model.get(self.handle).data.name
                        }
                        var proc_type = self.model.get(self.handle).data.amount > 0 ? 'in' : 'out';
                        self.process_gera_io(boxes, proc_type, Math.abs(self.model.get(self.handle).data.amount), comment)
                        .then(function (res) {
                               if ((res.result && !res.error) || (!res.result)){
                                   var error =  res.error
                                   if (!res.result && res.error) {
                                        self.do_warn(_t("Error"), _t("An error occurred during printing receipt. ") + res.result);
                                   } else if (!res.result && !error){
                                        self.do_warn(_t("Error"), _t("An error occurred during printing receipt."));
                                   } else {
                                        self.do_warn(_t("Error"), _t("An error occurred during printing receipt. ") + error.data.message);
                                   }
                               } else {
                                    _super(ev)
                               }
                            });
                    } else {
                         _super(ev)
                    }
                });

           } else {
                this._super(ev);
           }
        } else {
            this._super(ev);
        }
    },

    process_gera_io: function(boxes, proc_type, amount, comment){
        for (var box in boxes) {
            return this.call(
                    'iot_longpolling',
                    'action',
                    box,
                    boxes[box][0],
                    {
                         action: 'print_receipt',
                         receipt: {
                            amount: amount,
                            type: proc_type,
                            comment: comment,
                         },
                         io: true,
                         device_id: boxes[box][0],
                         user: boxes[box][3],
                         password: boxes[box][4]
                    },
                    '',
                    ''
                )
        }
    },

    _onReportFiscalZClicked: function (ev) {
        ev.preventDefault();
        var boxes = this.triggers;
        var ip = this.box_fiscal_ip;
        if ((ip && boxes && boxes[ip][1] != 'gera fiscal') || !boxes || !ip){
            this._super(ev)
            return
        }
        this.process_gera_report(boxes, '0')
    },
    _onReportFiscalXClicked: function (ev) {
        ev.preventDefault();
        var boxes = this.triggers;
        var ip = this.box_fiscal_ip;
        if ((ip && boxes && boxes[ip][1] != 'gera fiscal') || !boxes || !ip){
            this._super(ev)
            return
        }
        this.process_gera_report(boxes, '10')
    },
    _onReportFiscalXProductClicked: function (ev) {
        ev.preventDefault();
        var boxes = this.triggers;
        var ip = this.box_fiscal_ip;
        if ((ip && boxes && boxes[ip][1] != 'gera fiscal') || !boxes || !ip){
            this._super(ev)
            return
        }
        this.process_gera_report(boxes, '20')
    },

    process_gera_report: function (boxes, report_type) {
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