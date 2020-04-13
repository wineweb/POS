# -*- coding: utf-8 -*-

import datetime
from datetime import timedelta
import random
from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


class UploadIotBoxGera(models.TransientModel):
    _name = 'upload.iot.box.gera'
    _description = 'Upload Gera Settings to IoT Box wizard'

    fiscal_recorder = fields.Many2one('ukr.fiscal.recorder', 'Fiscal Recorder', domain="[('fiscal_recorder', '=', 'gera_mgn707ts')]")
    upload_all = fields.Boolean('Upload for All IoT Box')
    iot_box_ids = fields.Many2many('iot.box', string='IoT Box')

    @api.model
    def default_get(self, vals):
        res = super(UploadIotBoxGera, self).default_get(vals)
        if self.env.context.get('active_id'):
            res['fiscal_recorder'] = self.env.context['active_id']
        return res

    def upload(self):
        self.ensure_one()
        if self.upload_all:
            exist = self.env['iot.box'].search([])
            if not exist:
                raise ValidationError(_('There is not IoT Boxes'))
            for box in exist:
                self.fiscal_recorder.upload_gera_settings(box.ip)
        else:
            if not self.iot_box_ids:
                raise ValidationError(_('There is not IoT Boxes'))
            for box in self.iot_box_ids:
                self.fiscal_recorder.upload_gera_settings(box.ip)

        return self.env['ir.actions.act_window'].for_xml_id('mo_ukr_fiscal_recorder', 'ukr_fiscal_recorder_action_window')
