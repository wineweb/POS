import base64
import requests

from odoo import api, fields, models, exceptions, _
from odoo.exceptions import ValidationError
from odoo.models import AbstractModel


class IotDevice(models.Model):
    _inherit = 'iot.device'

    printer_model = fields.Many2one('ukr.fiscal.recorder', 'Fiscal Printer', domain="[('fiscal_serial', '=', identifier)]")

    @api.onchange('printer_model')
    def change_printer(self):
        for device in self:
            if device.printer_model:
                configs = self.env['pos.config'].search([('fiscal_recorder', 'in', device.printer_model.ids)])
                if configs:
                    if configs.mapped('session_ids').filtered(lambda s: s.state != 'closed'):
                        raise ValidationError(_('You should close all active POS sessions before make changes'))
                    for config in configs:
                        config.upload_settings(config)

    def unlink(self):
        for device in self:
            if device.printer_model:
                configs = self.env['pos.config'].search([('fiscal_recorder', 'in', device.printer_model.ids)])
                if configs:
                    if configs.mapped('session_ids').filtered(lambda s: s.state != 'closed'):
                        raise ValidationError(_('You should close all active POS sessions before make changes'))
                    configs.write({
                        'fiscal_recorder': False
                    })
