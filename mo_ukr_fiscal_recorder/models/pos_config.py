# -*- coding: utf-8 -*-

import logging
import psycopg2
import json
import requests
from odoo.exceptions import ValidationError
import datetime
from ..models import ukr_fiscal_recorder as fiscal

from odoo import api, fields, models, registry, SUPERUSER_ID, _

_logger = logging.getLogger(__name__)


class PosConfig(models.Model):
    _inherit = 'pos.config'

    fiscal_recorder = fields.Many2one('ukr.fiscal.recorder', string='Fiscal Recorder', compute='get_fiscal_recorder', store=True)
    fiscal_receipt_type = fields.Selection(related='fiscal_recorder.fiscal_receipt_type', string="Fiscal Receipt Type",
                                           reqdonly=True)
    fiscal_settings_controller = fields.Char(related='fiscal_recorder.fiscal_settings_controller',
                                             string="Fiscal Settings Controller Route", reqdonly=True)
    fiscal_receipt_controller = fields.Char(related='fiscal_recorder.fiscal_receipt_controller',
                                            string="Fiscal Receipt Controller Route", reqdonly=True)

    @api.depends('iface_printer_id')
    def get_fiscal_recorder(self):
        for pos in self:
            if pos.iface_printer_id and pos.iface_printer_id.printer_model:
                pos.fiscal_recorder = pos.iface_printer_id.printer_model.id
            else:
                pos.fiscal_recorder = False

    def upload_settings(self, record):
        if record.mapped('session_ids').filtered(lambda s: s.state != 'closed'):
            raise ValidationError(_('You should close all active POS sessions before make changes'))

        if (record.iface_printer_id and not record.iface_printer_id.printer_model) or not record.iface_printer_id:
            return

        # recorder_settings = record.fiscal_recorder
        recorder_settings = record.iface_printer_id.printer_model

        controller_path = fiscal.settings_controller_path[recorder_settings.fiscal_recorder]
        domain = self.make_domain(record.iface_printer_id.iot_ip, controller_path)

        settings_fields = fiscal.settings_fields[recorder_settings.fiscal_recorder]
        tax_vals = self.env[fiscal.tax_model[recorder_settings.fiscal_recorder]].get_model_taxes()
        payment_vals = self.env[fiscal.payment_model[recorder_settings.fiscal_recorder]].get_model_payment()
        receipt_controller = fiscal.receipt_controller_path.get(recorder_settings.fiscal_recorder, False)
        if not receipt_controller:
            raise ValidationError(_('You need receipt controller to print fiscal receipts'))

        settings_dict = recorder_settings.read(settings_fields)[0]  # get values from settings fields
        settings_dict['taxes'] = tax_vals
        settings_dict['payments'] = payment_vals
        settings_dict['receipt_controller'] = receipt_controller
        settings_dict['fiscal_serial'] = recorder_settings.fiscal_serial

        data = {
            'params': settings_dict
        }

        send_data = json.dumps(data)
        try:
            headers = {'Content-Type': 'application/json'}
            # send settings
            response = requests.post(url=domain, data=send_data, headers=headers, timeout=6.0)
        except Exception as error:
            _logger.error(error)
            raise ValidationError(error)
        if response.status_code == 200:
            response_json = json.loads(response.text)
            if response_json.get('result', False):
                raise ValidationError(response_json['result'])
        else:
            _logger.error(response.text)
            raise ValidationError(response.text)

    def write(self, vals):
        res = super(PosConfig, self).write(vals)
        for record in self:
            if 'iface_printer_id' not in vals or not record.iface_printer_id or (
                    'iface_printer_id' not in vals and not record.iface_printer_id) or not record.iface_printer_id.printer_model:
                continue

            self.upload_settings(record)

        return res

    def make_domain(self, ip, path):
        proxy = ip
        default_port = '8069'
        port = proxy.split(':')
        if len(port) > 1:
            domain = 'http://' + port[0] + ':' + port[1] + path
        else:
            domain = 'http://' + proxy + ':' + default_port + path
        return domain

    def make_report_path(self, report_type):
        if self.iface_printer_id or not self.iface_printer_id.iot_ip:
            proxy_ip = self.iface_printer_id.iot_ip
            try:
                path = fiscal.reports_controller_path[self.fiscal_recorder.fiscal_recorder][report_type]
            except Exception as error:
                raise ValidationError(_('Cannot get {} controller'.format(report_type)))
            domain = self.make_domain(proxy_ip, path)
            return domain
        else:
            raise ValidationError('Can not print without proxy')

    def send_request(self, domain):
        response = requests.get(url=domain)
        if response.status_code == 500:
            raise ValidationError(_('Print error.') + response.reason)

    """Function which send request to print Z-Report"""

    def print_z_report(self):
        domain = self.make_report_path('Z-Report')
        self.send_request(domain)

    """Function which send request to print X-Report"""

    def print_x_report(self):
        domain = self.make_report_path('X-Report')
        self.send_request(domain)

    """Function which send request to print Product X-Report"""

    def print_product_x_report(self):
        domain = self.make_report_path('Product X-Report')
        self.send_request(domain)


class PosSession(models.Model):
    _inherit = 'pos.session'

    show_reports = fields.Boolean(compute='_compute_show_reports', default=False, string='Show Recorder Reports')

    def _compute_show_reports(self):
        if self.config_id.fiscal_recorder:
            self.show_reports = True
        else:
            self.show_reports = False

    """Functions which call report functions from config"""

    def print_z_report(self):
        self.config_id.print_z_report()

    def print_x_report(self):
        self.config_id.print_x_report()

    def print_product_x_report(self):
        self.config_id.print_product_x_report()
