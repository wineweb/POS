# -*- coding: utf-8 -*-

import logging
import psycopg2
import json
import requests
from odoo.exceptions import ValidationError
import datetime
from .gera_mgn707ts import _key

from odoo import api, fields, models, registry, SUPERUSER_ID, _

_logger = logging.getLogger(__name__)


class PosConfig(models.Model):
    _inherit = 'pos.config'

    def _compute_boxes(self):
        box_dict = {}
        for config in self:
            if config.fiscal_recorder.fiscal_recorder != _key:
                super(PosConfig, self)._compute_boxes()
                continue
            if config.fiscal_recorder and config.iface_printer_id:
                box = config.iface_printer_id.iot_id.ip
                box_dict[box] = (
                    [config.iface_printer_id.identifier, config.iface_printer_id.manufacturer,
                     'print_report', self.env.user.gera_user_id,
                     self.env.user.gera_user_password])
                config.box_with_fiscal = json.dumps(box_dict)
                config.box_fiscal_ip = config.iface_printer_id.iot_id.ip
            else:
                config.box_with_fiscal = False
                config.box_fiscal_ip = False

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

