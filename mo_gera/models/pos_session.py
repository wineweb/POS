# -*- coding: utf-8 -*-
import logging
import json
import requests
from odoo.exceptions import ValidationError, UserError
from odoo import api, fields, models, registry, SUPERUSER_ID, _
from .gera_mgn707ts import _key, path_money_in_out
from odoo.addons.point_of_sale.wizard.pos_box import PosBox

_logger = logging.getLogger(__name__)


class PosSession(models.Model):
    _inherit = 'pos.session'

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
            else:
                session.box_with_fiscal = False
                session.box_fiscal_ip = False

    def money_in_out(self, amount, proc_tye, comment):
        if not self.config_id.fiscal_recorder.fiscal_recorder or self.config_id.fiscal_recorder.fiscal_recorder != _key:
            return
        save_comment = False
        if not self.config_id.fiscal_recorder.gr_comment_in_io_receipt:
            save_comment = False
        elif self.config_id.fiscal_recorder.gr_comment_in_io_receipt and not self.config_id.fiscal_recorder.gr_comment_in_io_sale_tape:
            save_comment = False
        elif self.config_id.fiscal_recorder.gr_comment_in_io_receipt and self.config_id.fiscal_recorder.gr_comment_in_io_sale_tape:
            save_comment = True
        data = {
            'params':
                {
                    'amount': amount,
                    'type': proc_tye,
                    'comment': comment if self.config_id.fiscal_recorder.gr_comment_in_io_receipt else False,
                    'save_comment': save_comment
                },
        }
        proxy = self.config_id.iface_printer_id.iot_ip
        path = path_money_in_out
        domain = self.config_id.make_domain(proxy, path)
        domain += '/' + self.config_id.iface_printer_id.identifier + '/' + self.env.user.gera_user_id + '/' + self.env.user.gera_user_password
        send_data = json.dumps(data)
        try:
            headers = {'Content-Type': 'application/json'}
            # make request to fiscal recorder
            response = requests.post(url=domain, data=send_data, headers=headers, timeout=5.0)
        except Exception as error:
            _logger.error(error)
            raise ValidationError(error)
        if response.status_code == 200:
            response_json = json.loads(response.text)
            if response_json.get('error', False):
                raise ValidationError(response_json['error']['data']['message'])
            elif response_json.get('result', False) and not response_json['result']:
                error = _('Can not make IO')
                raise ValidationError(error)


class PosBoxOut(PosBox):
    _inherit = 'cash.box.out'

    def _calculate_values_for_statement_line(self, record):
        if record.pos_session_id.config_id.iface_printer_id and record.pos_session_id.config_id.fiscal_recorder and \
                record.pos_session_id.config_id.iface_printer_id.manufacturer == 'gera fiscal':
            proc_type = 'out' if self.amount < 0 else 'in'
            record.pos_session_id.money_in_out(self.amount, proc_type, self.name)  # send to fiscal order before

        values = super(PosBoxOut, self)._calculate_values_for_statement_line(record)
        return values
