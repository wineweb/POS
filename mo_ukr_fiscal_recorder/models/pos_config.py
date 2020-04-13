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

        record.iface_printer_id.printer_mode.upload_settings()

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
