<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Did;
use App\Models\Customer;
use App\Models\Trunk;
use App\Models\Ivr;

class DIDController extends Controller
{
    // SHOW ALL DIDs
    public function index()
    {
        $dids = Did::all();
        return view('admin.dids.index', compact('dids'));
    }

    // CREATE DID PAGE
    public function create()
    {
        $customers = Customer::all();
        $trunks = Trunk::all();
        $ivrs = Ivr::all(); // Load IVRs

        return view('admin.dids.create', compact('customers','trunks','ivrs'));
    }

    // STORE NEW DID
    public function store(Request $request)
    {
        $did = new Did();
        $did->number = $request->number;
        $did->route_type = $request->route_type;

        // IVR routing logic
        if ($request->route_type == 'ivr') {
            $did->ivr_id = $request->ivr_id;
        } else {
            $did->ivr_id = null;
        }

        $did->save();

        return redirect('/admin/dids')->with('success', 'DID created successfully');
    }

    // EDIT DID PAGE
    public function edit($id)
    {
        $did = Did::find($id);
        $customers = Customer::all();
        $trunks = Trunk::all();
        $ivrs = Ivr::all(); // Load IVRs

        return view('admin.dids.edit', compact('did','customers','trunks','ivrs'));
    }

    // UPDATE DID
    public function update(Request $request, $id)
    {
        $did = Did::find($id);
        $did->number = $request->number;
        $did->route_type = $request->route_type;

        // IVR routing logic
        if ($request->route_type == 'ivr') {
            $did->ivr_id = $request->ivr_id;
        } else {
            $did->ivr_id = null;
        }

        $did->save();

        return redirect('/admin/dids')->with('success', 'DID updated successfully');
    }

    // DELETE DID
    public function delete($id)
    {
        Did::destroy($id);
        return redirect('/admin/dids')->with('success', 'DID deleted successfully');
    }
}
