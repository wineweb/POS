odoo.define('mo_ukr_fiscal_recorder.fiscal_kanban', function(require) {
"use strict";

var KanbanController = require('web.KanbanController');;
var session = require('web.session');


KanbanController.include({

     start: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            var state = self.model.get(self.handle);
            if (self.modelName === 'pos.config') {
                for (var item in state.data){
                    var item_data = state.data[item].data;
                    if (item_data.box_with_fiscal) {
                        self.triggers = JSON.parse(item_data.box_with_fiscal);
                        self.box_fiscal_ip = item_data.box_fiscal_ip;
                        var boxes = self.triggers;
//                        for (var box in boxes) {
//                            var devices = [];
//                            for (var device in boxes[box]) {
//                                devices.push(boxes[box][device][0]);
//                            }
            //                self.call('iot_longpolling', 'addListener', box, devices, self._onValueChange.bind(self));
//                        }
                    }
                }
            }
        });
    },
    _onButtonClicked: function (ev) {
        if (this.modelName === 'pos.config'){
           if (ev.data.attrs.name === 'print_z_report' || ev.data.attrs.name === 'print_x_report' || ev.data.attrs.name === 'print_product_x_report'){
                this._super(ev);
           } else {
                this._super(ev);
           }
        } else {
            this._super(ev);
        }
    },


});

})