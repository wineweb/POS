# -*- coding: utf-8 -*-
import logging
import psycopg2
import json
import requests
from odoo.exceptions import ValidationError, UserError
from odoo import api, fields, models, registry, SUPERUSER_ID, _

try:
    from odoo.addons.mo_ukr_fiscal_recorder.models import ukr_fiscal_recorder as fiscal
except ImportError:
    raise ImportError(_('Cannot load ukrainian fiscal recorder module'))

from odoo.addons.point_of_sale.wizard.pos_box import PosBox

_logger = logging.getLogger(__name__)

_key = 'gera_mgn707ts'
fiscal.settings_fields[_key] = ['gr_printer_ip', 'gr_cashier_id', 'gr_cashier_password']
fiscal.payment_model[_key] = 'gera.fiscal.recorder.payment'
fiscal.tax_model[_key] = 'gera.fiscal.recorder.tax'
fiscal.settings_controller_path[_key] = '/send_printer_settings'
fiscal.reports_controller_path[_key] = {
    'Z-Report': '/print_report/0',
    'X-Report': '/print_report/10',
    'Product X-Report': '/print_report/20',
}
fiscal.receipt_controller_path[_key] = '/hw_proxy/gr_print_fiscal_receipt'
fiscal.get_settings_controller_path[_key] = '/hw_proxy/gr_get_settings'
path_money_in_out = '/hw_proxy/gr_money'


class GERAFiscalPayment(models.Model):
    _name = 'gera.fiscal.recorder.payment'
    _description = 'GERA MG N707TS Recorder Payments'

    number = fields.Integer('Number')
    payment_id = fields.Many2one('pos.payment.method', string='Payment')
    fiscal_recorder = fields.Many2one('ukr.fiscal.recorder', string='Fiscal Recorder', ondelete='cascade')

    """Returns json of recorder-related payments"""

    def get_model_payment(self):
        values = self.search([])
        payment_json = {}
        for item in values:
            payment_json[item.number] = item.payment_id.id
        if not payment_json:
            raise ValidationError(_('You can not set fiscal recorder without payments!'))
        return payment_json


class GERAFiscalTax(models.Model):
    _name = 'gera.fiscal.recorder.tax'
    _description = 'GERA MG N707TS Recorder Taxes'

    number = fields.Integer('Number')
    tax_ids = fields.Many2many('account.tax', string='Taxes')
    fiscal_recorder = fields.Many2one('ukr.fiscal.recorder', string='Fiscal Recorder', ondelete='cascade')

    """Returns json of recorder-related taxes"""

    def get_model_taxes(self):
        values = self.search([])
        tax_json = {}
        for item in values:
            tax_ids = []
            for tax in item.tax_ids:
                tax_ids.append(tax.id)
            tax_json[item.number] = tax_ids
        if not tax_json:
            raise ValidationError(_('You can not set fiscal recorder without taxes!'))
        return tax_json


class FiscalRecorderGeraMGN707TS(models.Model):
    _inherit = 'ukr.fiscal.recorder'

    fiscal_recorder = fields.Selection(selection_add=[(_key, 'GERA MG N707TS')])

    gr_printer_ip = fields.Char('Printer IP')
    gr_cashier_id = fields.Char('Cashier ID')
    gr_cashier_password = fields.Char('Cashier Password')
    gr_fiscal_tax_ids = fields.One2many('gera.fiscal.recorder.tax', 'fiscal_recorder')
    gr_fiscal_payment_ids = fields.One2many('gera.fiscal.recorder.payment', 'fiscal_recorder')
    gr_comment_in_io_receipt = fields.Boolean('Comment in IO Receipt')
    gr_comment_in_io_sale_tape = fields.Boolean('Save IO Comment in Sale Tape')

    @api.onchange('gr_comment_in_io_receipt')
    def change_comment_io(self):
        for recorder in self:
            if not recorder.gr_comment_in_io_receipt:
                recorder.gr_comment_in_io_sale_tape = False

    def write(self, vals):
        res = super(FiscalRecorderGeraMGN707TS, self).write(vals)
        for record in self:
            if any((field in vals.keys() for field in fiscal.settings_fields[_key])) or vals.get('gr_fiscal_tax_ids', False) or vals.get('gr_fiscal_tax_ids', False):
                pos_config = self.env['pos.config'].search([('fiscal_recorder', '=', record.id)])
                if not pos_config:
                    continue
                for pos in pos_config:
                    if pos.mapped('session_ids').filtered(lambda s: s.state != 'closed'):
                        raise ValidationError(_('You should close all active POS sessions before make changes'))
                    self.env['pos.config'].upload_settings(pos_config)
        return res
