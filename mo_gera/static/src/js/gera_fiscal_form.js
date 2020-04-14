odoo.define('mo_ukr_fiscal_recorder.gera_fiscal_form', function(require) {
"use strict";

var FormController = require('web.FormController');
var session = require('web.session');


FormController.include({

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
                    boxes[box][device][0],
                    {
                         action: boxes[box][3],
                         report_type: report_type,
                         device_id: boxes[box][0],
                         user: boxes[box][3],
                         password: boxes[box][4]
                    },
                    '',
                    ''
                );
        }
     }

});

})