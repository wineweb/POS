# -*- coding: utf-8 -*-

import logging
import psycopg2
import json
import requests
from odoo.exceptions import ValidationError
import datetime
from .gera_mgn707ts import fiscal

from odoo import api, fields, models, registry, SUPERUSER_ID, _

_logger = logging.getLogger(__name__)


class PosConfig(models.Model):
    _inherit = 'pos.config'

    def make_report_path(self, report_type):
        domain = super(PosConfig, self).make_report_path(report_type)
        if self.iface_printer_id and self.fiscal_recorder and self.iface_printer_id.manufacturer == 'gera fiscal':
            domain += '/' + self.iface_printer_id.identifier + '/' + self.env.user.gera_user_id + '/' + self.env.user.gera_user_password
        return domain

    def send_request(self, domain):
        if self.iface_printer_id and self.fiscal_recorder and self.iface_printer_id.manufacturer == 'gera fiscal':
            response = requests.get(url=domain)
            if response.status_code == 500:
                raise ValidationError(_('Print error.') + response.reason)
            if response.status_code == 200 and (response.text != '' or not response.text):
                response_json = json.loads(response.text)
                if response_json.get('error', False):
                    raise ValidationError(response_json['error']['data']['message'])
                elif response_json.get('result', False):
                    raise ValidationError(response_json['result'])
                else:
                    raise ValidationError(_('Print error.') + response.text)
        else:
            super(PosConfig, self).send_request(domain)

    """Function which send request to print X-Report"""

    def print_x_report(self):
        if self.iface_printer_id and self.fiscal_recorder and self.iface_printer_id.manufacturer == 'gera fiscal':
            domain = self.make_report_path('X-Report')
            self.send_request(domain)
        else:
            super(PosConfig, self).print_x_report()

    """Function which send request to print Z-Report"""

    def print_z_report(self):
        if self.iface_printer_id and self.fiscal_recorder and self.iface_printer_id.manufacturer == 'gera fiscal':
            domain = self.make_report_path('Z-Report')
            self.send_request(domain)
        else:
            super(PosConfig, self).print_z_report()

    """Function which send request to print Product X-Report"""

    def print_product_x_report(self):
        if self.iface_printer_id and self.fiscal_recorder and self.iface_printer_id.manufacturer == 'gera fiscal':
            domain = self.make_report_path('Product X-Report')
            self.send_request(domain)
        else:
            super(PosConfig, self).print_product_x_report()
