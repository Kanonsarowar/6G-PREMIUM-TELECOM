<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\DidRoute;

class DidRoutingApiController extends Controller
{
    public function lookup(Request $request)
    {
        $did = $request->query('did_number');

        if (!$did) {
            return response()->json([
                'route_action' => 'REJECT',
                'route_dest'   => null
            ]);
        }

        $route = DidRoute::with('trunk')
            ->where('did_number', $did)
            ->where('active', 1)
            ->first();

        if (!$route) {
            return response()->json([
                'route_action' => 'REJECT',
                'route_dest'   => null
            ]);
        }

        if ($route->trunk_id && $route->trunk) {
            return response()->json([
                'route_action' => 'FORWARD',
                'route_dest'   => $route->trunk->sip_username
            ]);
        }

        if ($route->forward_to) {
            return response()->json([
                'route_action' => 'FORWARD',
                'route_dest'   => $route->forward_to
            ]);
        }

        return response()->json([
            'route_action' => 'REJECT',
            'route_dest'   => null
        ]);
    }
}
