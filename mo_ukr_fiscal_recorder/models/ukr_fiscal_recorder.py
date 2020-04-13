# -*- coding: utf-8 -*-

import logging
import psycopg2
import json
import requests
from odoo.exceptions import ValidationError

from odoo import api, fields, models, registry, SUPERUSER_ID, _

_logger = logging.getLogger(__name__)

settings_fields = {}  # Global variable. Should consist fields which will send on machine running POSBOX/IOTBOX
payment_model = {}  # Global variable. Should consist payment model which will send on machine running POSBOX/IOTBOX
tax_model = {}  # Global variable. Should consist tax model which will send on machine running POSBOX/IOTBOX
settings_controller_path = {}  # Global variable. Should consist path to settings controller on machine running POSBOX/IOTBOX
reports_controller_path = {}  # Global variable. Should consist path to report controller on machine running POSBOX/IOTBOX
receipt_controller_path = {}  # Global variable. Should consist path to receipt controller on machine running POSBOX/IOTBOX
get_settings_controller_path = {}  # Global variable. Should consist path to controller which return settings on machine running POSBOX/IOTBOX


class UkrFiscalRecorder(models.Model):
    _name = 'ukr.fiscal.recorder'
    _description = "Ukrainian Fiscal Registers"
    _rec_name = 'fiscal_recorder'

    fiscal_recorder = fields.Selection([], string='Fiscal Recorder')
    fiscal_number = fields.Char('Fiscal Number')
    fiscal_serial = fields.Char('Fiscal Serial Number', required=True)
    fiscal_receipt_type = fields.Selection([('json', 'JSON'), ('xml', 'XML')], default='json', string='Fiscal Receipt Type')
    fiscal_settings_controller = fields.Char(string='Settings Controller Route')
    fiscal_receipt_controller = fields.Char(string='Receipt Controller Route')

    @api.depends('fiscal_recorder', 'fiscal_number')
    def name_get(self):
        """ Display name """
        res = []
        for recorder in self:
            if recorder.fiscal_number:
                res.append((recorder.id, dict(recorder._fields['fiscal_recorder'].selection).get(
                    str(recorder.fiscal_recorder)) + ' (' + recorder.fiscal_number + ')'))
            else:
                res.append((recorder.id,
                            dict(recorder._fields['fiscal_recorder'].selection).get(str(recorder.fiscal_recorder))))
        return res

    def reload_settings(self):
        pos_config = self.env['pos.config'].search([('fiscal_recorder', '=', self.id)])
        if pos_config:
            controller_path = self.settings_controller_path[self.fiscal_recorder]
            domain = self.env['pos.config'].make_domain(pos_config.proxy_ip, controller_path)

    def write(self, vals):
        if 'fiscal_settings_controller' in vals:
            if vals['fiscal_settings_controller'][0] != '/':
                vals['fiscal_settings_controller'] = '/' + vals['fiscal_settings_controller']
        else:
            settings_controller = get_settings_controller_path.get(self.fiscal_recorder, False)
            if settings_controller:
                vals['fiscal_settings_controller'] = settings_controller
        if 'fiscal_receipt_controller' in vals:
            if vals['fiscal_receipt_controller'][0] != '/':
                vals['fiscal_receipt_controller'] = '/' + vals['fiscal_receipt_controller']
        else:
            receipt_controller = receipt_controller_path.get(self.fiscal_recorder, False)
            if receipt_controller:
                vals['fiscal_receipt_controller'] = receipt_controller
            else:
                raise ValidationError(_('You need to provide name of receipt controller'))
        res = super(UkrFiscalRecorder, self).write(vals)
        return res
