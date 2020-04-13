odoo.define('mo_ukr_fiscal_recorder.fiscal_recorder', function(require) {
"use strict";

var screens = require('point_of_sale.screens')
var gui = require('point_of_sale.gui')
var models = require('point_of_sale.models')
var chrome = require('point_of_sale.chrome')
var rpc = require('web.rpc');
var core = require('web.core')
var QWeb = core.qweb
var _t = core._t
var utils = require('web.utils')
var round_pr = utils.round_precision
var devices = require('point_of_sale.devices')
var PaymentIOT = require('pos_iot.payment');
var PrinterProxy = require('pos_iot.Printer');
var Session = require('web.Session');
var fiscal_taxes = {}
var receipt_controller

models.Orderline = models.Orderline.extend({

    get_all_prices: function(){
        var price_unit = this.get_unit_price() * (1.0 - (this.get_discount() / 100.0));
        var taxtotal = 0;

        var product =  this.get_product();
        var taxes_ids = product.taxes_id;
        var taxes =  this.pos.taxes;
        var taxdetail = {};
        var product_taxes = [];

        _(taxes_ids).each(function(el){
            product_taxes.push(_.detect(taxes, function(t){
                return t.id === el;
            }));
        });

        var rounding = this.pos.currency.rounding
        if(this.pos.proxy.printer && this.pos.config.fiscal_recorder){ //we need 3 digits after dot
            rounding = 0.001
        }

        var all_taxes = this.compute_all(product_taxes, price_unit, this.get_quantity(), rounding);
        _(all_taxes.taxes).each(function(tax) {
            taxtotal += tax.amount;
            taxdetail[tax.id] = tax.amount;
        });

        return {
            "priceWithTax": all_taxes.total_included,
            "priceWithoutTax": all_taxes.total_excluded,
            "tax": taxtotal,
            "taxDetails": taxdetail,
        };
    },
})

models.Order = models.Order.extend({

    export_as_JSON: function() {
        var orderLines, paymentLines;
        orderLines = [];
        this.orderlines.each(_.bind( function(item) {
            return orderLines.push([0, 0, item.export_as_JSON()]);
        }, this));
        paymentLines = [];
        this.paymentlines.each(_.bind( function(item) {
            return paymentLines.push([0, 0, item.export_as_JSON()]);
        }, this));
          function round(number){
            return +number.toFixed(2);
        }
        if(this.pos.proxy.printer && this.pos.config.fiscal_recorder){ //if fiscal recorder - round amount total and tax
            return {
                name: this.get_name(),
                amount_paid: this.get_total_paid() - this.get_change(),
                amount_total: round(this.get_total_with_tax()),
                amount_tax: round(this.get_total_tax()),
                amount_return: round(this.get_change()),
                lines: orderLines,
                statement_ids: paymentLines,
                pos_session_id: this.pos_session_id,
                pricelist_id: this.pricelist ? this.pricelist.id : false,
                partner_id: this.get_client() ? this.get_client().id : false,
                user_id: this.pos.get_cashier().id,
                uid: this.uid,
                sequence_number: this.sequence_number,
                creation_date: this.validation_date || this.creation_date, // todo: rename creation_date in master
                fiscal_position_id: this.fiscal_position ? this.fiscal_position.id : false
            };
        }else{
             return {
            name: this.get_name(),
            amount_paid: this.get_total_paid() - this.get_change(),
            amount_total: this.get_total_with_tax(),
            amount_tax: this.get_total_tax(),
            amount_return: this.get_change(),
            lines: orderLines,
            statement_ids: paymentLines,
            pos_session_id: this.pos_session_id,
            pricelist_id: this.pricelist ? this.pricelist.id : false,
            partner_id: this.get_client() ? this.get_client().id : false,
            user_id: this.pos.get_cashier().id,
            uid: this.uid,
            sequence_number: this.sequence_number,
            creation_date: this.validation_date || this.creation_date, // todo: rename creation_date in master
            fiscal_position_id: this.fiscal_position ? this.fiscal_position.id : false
        };
        }
    },

    get_total_without_tax: function() {
        function round(number){
            return +number.toFixed(2);
        }
        if(this.pos.proxy.printer && this.pos.config.fiscal_recorder){
            return this.orderlines.reduce((function(sum, orderLine) {
                return sum + orderLine.get_price_without_tax();
            }),0)
        }else{
            return round_pr(this.orderlines.reduce((function(sum, orderLine) {
                return sum + orderLine.get_price_without_tax();
            }), 0), this.pos.currency.rounding);
        }
    },

    get_total_tax: function() {
         if(this.pos.proxy.printer && this.pos.config.fiscal_recorder){
            return this.orderlines.reduce((function(sum, orderLine) {
                return sum + orderLine.get_tax();
            }),0)
        }else{
            return round_pr(this.orderlines.reduce((function(sum, orderLine) {
                return sum + orderLine.get_tax();
            }), 0), this.pos.currency.rounding);
        }
    },

    get_fiscal_receipt: function() {
        var order = this;
        if (this.pos.config.fiscal_receipt_type == 'json'){
            var env = {
                order:   order,
                receipt: order.export_for_printing(),
            };
            var product_array = []
            var qty_array_bigger_zero = []
            var qty_array_less_zero = []
            var qty_array_zero = []
            var self = this
            var orderlines_qty = order.get_orderlines().length
            order.get_orderlines().forEach(function (orderline) {
                var sale_lines = {}
                var product_price =  orderline.product.list_price //Product price without discounts and taxes
                var tax = orderline.get_tax() //Tax on product with discount if it is or without discount if not
                sale_lines['line_sum_with_tax_without_disc'] = false
                sale_lines['product_price_without_disc_with_tax'] = false
                if (orderline.discount > 0){
                    var price = product_price
                    var all_taxes = self.get_product_price_without_disc(orderline, price) //Get price with taxes without discount
                    sale_lines['line_sum_with_tax_disc'] = orderline.get_price_with_tax()
                    sale_lines['product_price_without_disc_with_tax'] = all_taxes['priceWithTax'] / orderline.quantity
                }else{
                    sale_lines['line_sum_with_tax_disc'] = orderline.get_price_with_tax()
                    sale_lines['line_sum_with_tax_without_disc'] = sale_lines['line_sum_with_tax_disc']
                }
                sale_lines['sum_tax'] = tax
                sale_lines['product_code'] = orderline.product.id
                sale_lines['product_name'] = orderline.product.display_name
                sale_lines['product_price_without_tax'] = product_price
                sale_lines['product_quantity'] = orderline.quantity
                sale_lines['product_taxes'] = orderline.product.taxes_id
                sale_lines['discount_percent'] = orderline.discount
                product_array.push(sale_lines)
                if (orderline.quantity > 0){
                    qty_array_bigger_zero.push(orderline.quantity)
                }else if(orderline.quantity < 0){
                    qty_array_less_zero.push(orderline.quantity)
                }else{
                    qty_array_zero.push(orderline.quantity)
                }
            });

            if(qty_array_zero.length > 0){
                 this.gui.show_popup('error',{ //If receipt has zero qty. Fiscal recorder does nor get zero qty
                    title :_t('Invalid receipt'),
                    body  :_t('Given receipt cannot be sent to fiscal recorder. Receipt has zero quantity.'),
                });
                order.finalized = false
                return false
            }

            //We need to check product quantities in receipt
            //to define check type: return or not
            if(orderlines_qty == qty_array_bigger_zero.length){
                env.receipt['is_return'] = false
            }else if (orderlines_qty == qty_array_less_zero.length){
                env.receipt['is_return'] = true
            }else{
                this.gui.show_popup('error',{ //If receipt has + and - quantities at same time, show error
                    title :_t('Invalid receipt'),
                    body  :_t('Given receipt cannot be sent to fiscal recorder. Receipt has quantity bigger zero and less zero at the same time'),
                });
                order.finalized = false
                return false
                }

            env.receipt['sale_lines'] = product_array
            var payments = []
            if(order.get_paymentlines().length > 0){
                order.get_paymentlines().forEach(function (payment) {
                    var payment_dict = {}
                    payment_dict['total_paid'] = payment.amount
    //                payment_dict['payment_id'] = payment.cashregister.journal.id
                    payment_dict['payment_id'] = payment['payment_method']["id"]
                    if (!payment.payment_method.is_cash_count && payment.payment_method.use_payment_terminal){
                        payment_dict['transaction_id'] = payment.transaction_id
                        payment_dict['card_type'] = payment.card_type
                    }
                    payments.push(payment_dict)
                })
            }else if(order.get_paymentlines().length == 0 && env.receipt['is_return'] == true){
                 this.gui.show_popup('error',{ //If return receipt has no payment
                    title :_t('Invalid payment'),
                    body  :_t('You should select payment on return receipt'),
                });
                order.finalized = false
                return false
            }
            env.receipt['total_discount'] = order.export_for_printing().total_discount
            if(env.receipt['total_paid'] == 0){
                env.receipt['total_paid'] = env.receipt['total_with_tax'].toFixed(2)
            }
            env.receipt['payments'] = payments
            var receipt = env.receipt;
            var subtotal = receipt['subtotal'];
            if(subtotal < 0 && receipt['total_paid']  > 0){
                  this.gui.show_popup('error',{
                    title :_t('Invalid payment'),
                    body  :_t('Subtotal is less than zero. You cannot send return receipt to fiscal recorder with positive payment'),
                });
                order.finalized = false
                return false
            }
        }else { //For xml fiscal receipt type
            var env = {
                widget:  this,
                pos:     this.pos,
                order:   this.pos.get_order(),
                receipt: this.pos.get_order().export_for_printing(),
                paymentlines: this.pos.get_order().get_paymentlines()
            };
            var receipt = QWeb.render('XmlReceipt',env);
        }
        return receipt
    },

    get_product_price_without_disc: function(orderline, price){
        if (price){
            var price_unit = price
        }else{
            var price_unit = this.get_unit_price()
        }
        var taxtotal = 0;

        var product =  orderline.get_product();
        var taxes_ids = product.taxes_id;
        var taxes =  this.pos.taxes;
        var taxdetail = {};
        var product_taxes = [];

        _(taxes_ids).each(function(el){
            product_taxes.push(_.detect(taxes, function(t){
                return t.id === el;
            }));
        });

        var all_taxes = orderline.compute_all(product_taxes, price_unit, orderline.quantity, this.pos.currency.rounding);
        _(all_taxes.taxes).each(function(tax) {
            taxtotal += tax.amount;
            taxdetail[tax.id] = tax.amount;
        });

        return {
            "priceWithTax": all_taxes.total_included,
            "priceWithoutTax": all_taxes.total_excluded,
            "tax": taxtotal,
            "taxDetails": taxdetail,
        };
    },
})

PaymentIOT.include({

    _onValueChange: function (resolve, order, data) {
        clearTimeout(this.payment_update);
        var line = order.get_paymentline(data.cid);
        var terminal_proxy = this.pos.payment_methods_by_id[line.payment_method.id].terminal_proxy;
        if (line && terminal_proxy && (!data.owner || data.owner === terminal_proxy._iot_longpolling._session_id)) {
            this._waitingResponse(resolve, data, line);
            if (data.processing) {
                this._query_terminal();
            }
            if (data.Ticket) {
                line.set_receipt_info(data.Ticket.replace(/\n/g, "<br />"));
            }
            if (data.TicketMerchant && this.pos.proxy.printer && this.pos.config.fiscal_receipt_type != 'json') { //check type of receipt
                this.pos.proxy.printer.print_receipt("<div class='pos-receipt'><div class='pos-payment-terminal-receipt'>" + data.TicketMerchant.replace(/\n/g, "<br />") + "</div></div>");
            }
        }
    },

})

screens.ReceiptScreenWidget.include({

    print: function() {
        if (this.pos.proxy.printer && this.pos.config.fiscal_recorder){
            if (this.pos.config.fiscal_receipt_type == 'json'){
                this.print_json();
            } else {
                this.print_html();
            }
            this.lock_screen(false);
        } else {
            this._super()
        }
    },

    //make receipt as json
    print_json: function () {
        var order = this.pos.get_order();
        var receipt = order.get_fiscal_receipt();
        this.pos.proxy.printer.print_receipt(receipt);
        this.pos.get_order()._printed = true;
    },

    // Check pos settings
    handle_auto_print: function() {
        if (this.pos.proxy.printer && this.pos.config.fiscal_recorder){
            if (this.pos.config.iface_print_auto && !this.pos.get_order().is_to_email() && this.pos.get_order()._printed) {
                if (this.should_close_immediately()){
                    this.click_next();
                }
            }
        } else {
            this._super()
        }
    },

})

PrinterProxy.include({

    print_receipt: function (receipt) {
        var self = this;
        if (receipt) {
            this.receipt_queue.push(receipt);
        }
        function process_next_job() {
            if (self.receipt_queue.length > 0) {
                var r = self.receipt_queue.shift();
                if (self.pos.config.fiscal_receipt_type == 'json'){
                    return self.sendReceipt(r)
                        .then(self.send_printing_job.bind(self))
                        .then(self._onIoTActionResult.bind(self))
                        .then(process_next_job)
                        .guardedCatch(self._onIoTActionFail.bind(self));
                } else {
                    return self.htmlToImg(r)
                        .then(self.send_printing_job.bind(self))
                        .then(self._onIoTActionResult.bind(self))
                        .then(process_next_job)
                        .guardedCatch(self._onIoTActionFail.bind(self));
                }
            }
        }
        return process_next_job();
    },

    sendReceipt: function (receipt) {
        var self = this;
        var promise = new Promise(function (resolve, reject) {
            self.receipt = receipt;
            resolve(self.receipt);
        });
        return promise;
    },


})

screens.PaymentScreenWidget.include({

/**
    We need to override this method because fiscal receipt should print
    on 'validate' button to avoid order validation if printer throws error
 */
    validate_order: function(force_validation) {
        if (this.pos.proxy.printer && this.pos.config.fiscal_recorder){
            if (this.order_is_valid(force_validation)){
                var self = this
                self._locked = true
                var order = this.pos.get_order();
                var receipt = order.get_fiscal_receipt()
                if (receipt == false){
                     order.finalized = false
                     return
                }
                 this.pos.proxy.printer.send_printing_job(receipt)
                .then(self.pos.proxy.printer._onIoTActionResult.bind(self.pos.proxy.printer))
                .guardedCatch(self.pos.proxy.printer._onIoTActionFail.bind(self.pos.proxy.printer));
            }
        } else {
           this._super(force_validation);
        }
    },
})


gui.Gui.include({

    //If POS has fiscal recorder make print button unclickable if 'receipt' and
    //'reprint receipt' screen
    show_screen: function(screen_name,params,refresh,skip_close_popup) {
        this._super(screen_name,params,refresh,skip_close_popup)
        if(screen_name == 'receipt' && this.pos.proxy.printer && this.pos.config.fiscal_recorder){
            self.$('.button.print').css({"pointer-events":"none","opacity":'0.5'});
        } else if (screen_name == 'reprint_receipt' && this.pos.proxy.printer && this.pos.config.fiscal_recorder){
            self.$('.button.print').css({"pointer-events":"visible","opacity":'initial'});
        }
    },

})

})

