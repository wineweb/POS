# -*- coding: utf-8 -*-

from odoo import fields, http, _
from odoo.http import request, content_disposition
import logging
import os
import io
import json
import zipfile
from odoo.modules import module as modules

_logger = logging.getLogger(__name__)


class MainController(http.Controller):

    @http.route([
        '/get_gera_settings'],
        type='http', auth="public",  csrf=False)
    def get_gera_settings(self, mac, auto, **kwargs):
        # box = request.env['iot.box'].sudo().search([('identifier', '=', mac)], limit=1)
        # if not box or (auto == 'True' and not box.drivers_auto_update):
        #     return ''

        zip_list = []
        for module in modules.get_modules():
            if module == 'mo_ukr_fiscal_recorder':
                for file in modules.get_module_filetree(module, 'printer_settings').keys():
                    if file.startswith('GERA'):
                        zip_list.append((modules.get_resource_path(module, 'printer_settings', file), file))

        file_like_object = io.BytesIO()
        zipfile_ob = zipfile.ZipFile(file_like_object, 'w')
        for zip in zip_list:
            zipfile_ob.write(zip[0], zip[1])  # In order to remove the absolute path
        zipfile_ob.close()
        return file_like_object.getvalue()

        if kwargs:
            path = os.path.dirname(os.path.dirname(__file__)) + '/printer_settings/'
            file_name = kwargs['identifier'] + '_settings.json'

            full_name_path = path + file_name

            file_exists = os.path.isfile(full_name_path)
            if file_exists:
                with io.open(full_name_path, 'r') as settings:
                    settings_json = json.load(settings)

                return settings_json
