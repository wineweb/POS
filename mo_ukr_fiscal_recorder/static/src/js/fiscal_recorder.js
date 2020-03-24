odoo.define('mo_ukr_fiscal_recorder.fiscal_recorder', function(require) {
"use strict";

var screens = require('point_of_sale.screens')
var gui = require('point_of_sale.gui')
var models = require('point_of_sale.models')
var core = require('web.core')
var QWeb = core.qweb
var _t = core._t
var utils = require('web.utils')
var round_pr = utils.round_precision
var devices = require('point_of_sale.devices')
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
        if(this.pos.config.fiscal_recorder){ //we need 3 digits after dot
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
        if(this.pos.config.fiscal_recorder){ //if fiscal recorder - round amount total and tax
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
        if(this.pos.config.fiscal_recorder){
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
         if(this.pos.config.fiscal_recorder){
            return this.orderlines.reduce((function(sum, orderLine) {
                return sum + orderLine.get_tax();
            }),0)
        }else{
            return round_pr(this.orderlines.reduce((function(sum, orderLine) {
                return sum + orderLine.get_tax();
            }), 0), this.pos.currency.rounding);
        }
    },
})

screens.PaymentScreenWidget.include({

    //We need to override this method because fiscal receipt should print
    //on 'validate' button
    finalize_validation: function() {
            var self = this;
            var order = this.pos.get_order();

            if (order.is_paid_with_cash() && this.pos.config.iface_cashdrawer) {
                    this.pos.proxy.open_cashbox();
            }

            order.initialize_validation_date();
            order.finalized = true;

            var receipt = false

            if (order.is_to_invoice()) {
                //We need to check fiscal recorder on POS
                if (this.pos.config.fiscal_recorder){
                    r = this.get_fiscal_receipt(order)
                    if (r == false){
                         order.finalized = false
                         return
                    }
                    if(!order.get_client()){
                        self.gui.show_popup('confirm',{
                            'title': _t('Please select the Customer'),
                            'body': _t('You need to select the customer before you can invoice an order.'),
                            confirm: function(){
                                self.gui.show_screen('clientlist');
                            },
                        });
                        self.invoicing = false
                        order.finalized = false
                        return
                    }
//               var name = receipt_controller
               var name = this.pos.config.fiscal_receipt_controller
               var res = this.pos.proxy.message_fiscal(name,{receipt: r })
               .done(function (res) { //If recorder return error, show popup
                    if(res){
                         self.gui.show_popup('error',{
                            'title': _t('The fiscal receipt error'),
                            'body': res,
                        });
                        self.invoicing = false;
                        order.finalized = false
                        return
                    }
                    var invoiced = this.pos.push_and_invoice_order(order);
                })
               .fail(function (res) {
                     if (typeof res == 'undefined') {
                        self.gui.show_popup('error',{
                            'title': _t("Connection Error"),
                            'body':  _t("Check proxy connection and try again."),
                        });
                    }else if(res.code < 0){
                        self.gui.show_popup('error',{
                            'title': _t('The fiscal receipt could not print'),
                            'body': _t('Invalid proxy connection or invalid procedure'),
                        });
                    }
                    self.invoicing = false;
                    order.finalized = false
                    return
                })
                }else{
                    var invoiced = this.pos.push_and_invoice_order(order);
                }
                this.invoicing = true;

                invoiced.fail(function(error){
                    self.invoicing = false;
                    order.finalized = false;
                    if (error.message === 'Missing Customer') {
                        self.gui.show_popup('confirm',{
                            'title': _t('Please select the Customer'),
                            'body': _t('You need to select the customer before you can invoice an order.'),
                            confirm: function(){
                                self.gui.show_screen('clientlist');
                            },
                        });
                    } else if (error.code < 0) {        // XmlHttpRequest Errors
                        self.gui.show_popup('error',{
                            'title': _t('The order could not be sent'),
                            'body': _t('Check your internet connection and try again.'),
                        });
                    } else if (error.code === 200) {    // OpenERP Server Errors
                        self.gui.show_popup('error-traceback',{
                            'title': error.data.message || _t("Server Error"),
                            'body': error.data.debug || _t('The server encountered an error while receiving your order.'),
                        });
                    } else {                            // ???
                        self.gui.show_popup('error',{
                            'title': _t("Unknown Error"),
                            'body':  _t("The order could not be sent to the server due to an unknown error"),
                        });
                    }
                });

                invoiced.done(function(){
                    self.invoicing = false;
                    self.gui.show_screen('receipt');
                });
            } else {
                //We need to check fiscal recorder on POS
                if (this.pos.config.fiscal_recorder){
                    var r = this.get_fiscal_receipt(order)
                    if (r == false){
                        order.finalized = false
                        return
                    }
//                    var name = receipt_controller
                    var name = this.pos.config.fiscal_receipt_controller
                    var res = this.pos.proxy.message_fiscal(name,{receipt: r })
                        .done(function (res) {
                            if(res){
                                 self.gui.show_popup('error',{
                                    'title': _t('The fiscal receipt error'),
                                    'body': res,
                                });
                                order.finalized = false
                                return
                            }
                            self.pos.push_order(order);
                            self.gui.show_screen('receipt');
                        })
                        .fail(function (res) {
                            if (typeof res == 'undefined') {
                                self.gui.show_popup('error',{
                                    'title': _t("Connection Error"),
                                    'body':  _t("Check proxy connection and try again."),
                                });
                            }else if(res.code < 0){
                                self.gui.show_popup('error',{
                                    'title': _t('The fiscal receipt could not print'),
                                    'body': _t('Invalid proxy connection or invalid procedure'),
                                });
                            }
                            order.finalized = false
                            return
                        })
                }else{
                    this.pos.push_order(order);
                    this.gui.show_screen('receipt');
                }
            }

        },

    //Method which creates and return fiscal receipt
    //return false if receipt has product quantities bigger than 0
    //and less 0 at the same time
    get_fiscal_receipt: function(order) {
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
                payment_dict['payment_id'] = payment.cashregister.journal.id
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

    //Method which gets price without discount and taxes
    //and computes only taxes on this price
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

devices.ProxyDevice.include({
     // connects to the specified url
//    connect: function(url){
//        var self = this;
//        this.connection = new Session(undefined,url, { use_cors: true});
//        this.host   = url;
//        this.set_connection_status('connecting',{});
//
//        return this.message('handshake').then(function(response){
//                if(response){
//                    self.set_connection_status('connected');
//                    localStorage.hw_proxy_url = url;
//                    self.keepalive();
//                    if (self.pos.config.fiscal_recorder && $.isEmptyObject(receipt_controller)){ //download settings from proxy
//                        var name = self.pos.config.fiscal_settings_controller
//                        self.message_fiscal(name)
//                         .done(function (res) {
//                                if(res){
//                                   fiscal_taxes = res[0]
//                                   receipt_controller = res[1]
//                                }
//                            })
//                          .fail(function (res) {
//                                 self.gui.show_popup('error',{
//                                    'title': _t('Loading fiscal recorder settings error'),
//                                    'body': _t('Invalid proxy connection or invalid procedure'),
//                                });
//                            })
//                     }
//                }else{
//                    self.set_connection_status('disconnected');
//                    console.error('Connection refused by the Proxy');
//                     self.gui.show_popup('error',{
//                                    'title': _t('Loading fiscal recorder settings error'),
//                                    'body': _t('Invalid proxy connection'),
//                                });
//                }
//            },function(){
//                self.set_connection_status('disconnected');
//                console.error('Could not connect to the Proxy');
//            });
//    },

    message_fiscal : function(name,params){
        var result
        if(this.get('status').status !== 'disconnected'){
            result = this.connection.rpc(name, params || {}, {shadow: false}).done(function(res) {
            result = res
       });
            return result
        }else{
            return (new $.Deferred()).reject();
        }
    },
})

gui.Gui.include({

    //If POS has fiscal recorder make print button unclickable if 'receipt' and
    //'reprint receipt' screen
    show_screen: function(screen_name,params,refresh,skip_close_popup) {
        this._super(screen_name,params,refresh,skip_close_popup)
        if((screen_name == 'receipt' || screen_name == 'reprint_receipt') && this.pos.config.fiscal_recorder){
            self.$('.button.print').css({"pointer-events":"none","opacity":'0.5'});
        }
        if(screen_name == 'reprint_receipt' && this.pos.config.fiscal_recorder){
            this.reprint_fiscal_receipt(this.pos.get_order())
        }
    },

     //Method which reprints last fiscal receipt
    reprint_fiscal_receipt: function(order) {
        if (order.screen_data.screen == 'reprint_receipt'){
            if (this.pos.config.fiscal_receipt_type == 'json'){
                var env = {
                     order:   order,
                     receipt: order.export_for_printing(),
                };
                var product_array = []
                env.receipt['sale_lines'] = product_array
                var r = env.receipt;
            }else {
                var env = {
                    widget:  this,
                    pos:     this.pos,
                    order:   this.pos.get_order(),
                    receipt: this.pos.get_order().export_for_printing(),
                    paymentlines: this.pos.get_order().get_paymentlines()
                };
                var r = QWeb.render('XmlReceipt',env);
            }
        }
        console.log(r);
        var self = this
//        var name = receipt_controller
        var name = this.pos.config.fiscal_receipt_controller
        var res = this.pos.proxy.message_fiscal(name,{receipt: r })
            .done(function (res) {
                if(res){
                    self.pos.gui.show_popup('error',{
                            'title': _t('The fiscal receipt error'),
                            'body': res,
                    });
                    return
                }
                self.pos.get_order()._printed = true;
            })
            .fail(function (res) {
                if (typeof res == 'undefined') {
                    self.pos.gui.show_popup('error',{
                        'title': _t("Connection Error"),
                        'body':  _t("Check proxy connection and try again."),
                    });
                }else if(res.code < 0){
                    self.pos.gui.show_popup('error',{
                        'title': _t('The copy of fiscal receipt could not print'),
                        'body': _t('Invalid proxy connection or invalid procedure'),
                    });
                }
                return
            })
    },
})

})
