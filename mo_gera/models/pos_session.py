# -*- coding: utf-8 -*-
import logging
import json
import requests
from odoo.exceptions import ValidationError, UserError
from odoo import api, fields, models, registry, SUPERUSER_ID, _
from .gera_mgn707ts import _key, path_money_in_out
from odoo.addons.point_of_sale.wizard.pos_box import PosBox
import json

_logger = logging.getLogger(__name__)


class PosSession(models.Model):
    _inherit = 'pos.session'

    box_with_fiscal_comment = fields.Char(compute='_compute_boxes')

    def _compute_boxes(self):
        box_dict = {}
        for session in self:
            if session.config_id.fiscal_recorder.fiscal_recorder != _key:
                super(PosSession, self)._compute_boxes()
                continue
            if session.config_id.fiscal_recorder and session.config_id.iface_printer_id:
                box = session.config_id.iface_printer_id.iot_id.ip
                box_dict.setdefault(box, [])
                box_dict[box] = (
                    [session.config_id.iface_printer_id.identifier, session.config_id.iface_printer_id.manufacturer,
                     'print_report', self.env.user.gera_user_id,
                     self.env.user.gera_user_password])
                session.box_with_fiscal = json.dumps(box_dict)
                session.box_fiscal_ip = session.config_id.iface_printer_id.iot_id.ip
                session.box_with_fiscal_comment = session.config_id.fiscal_recorder.gr_comment_in_io_receipt
            else:
                session.box_with_fiscal = False
                session.box_fiscal_ip = False
                session.box_with_fiscal_comment = False

    def get_iot_info(self):
        return {
            'box_with_fiscal': self.box_with_fiscal,
            'box_fiscal_ip': self.box_fiscal_ip,
            'box_with_fiscal_comment': self.box_with_fiscal_comment
        }
